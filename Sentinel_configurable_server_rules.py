import os
import json
import asyncio
import re
from datetime import datetime, timezone, timedelta

import discord
from discord import app_commands
from discord.ext import commands, tasks
from dotenv import load_dotenv


# ==================================================
# SENTINEL 1.2 - CONFIGURATION
# ==================================================

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
VERSION = "1.3"

CASE_FILE = "cases.json"
SERVER_CONFIG_FILE = "server_config.json"
WEEKLY_QUOTA_FILE = "weekly_quota.json"
SECURITY_FILE = "security_suspensions.json"

WEEKLY_QUOTA = 100

PUNISHMENT_DURATIONS = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "12h": timedelta(hours=12),
    "1d": timedelta(days=1),
    "3d": timedelta(days=3),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

# Only Suspension requires a duration.
TEMPORARY_PUNISHMENTS = {"Suspension"}

PUNISHMENT_NAMES = [
    "Strike 1",
    "Strike 2",
    "Strike 3",
    "Suspension",
    "Termination",
]


# ==================================================
# DEFAULT SERVER CONFIGURATION
# ==================================================

DEFAULT_CONFIG = {
    "promotion_ladder": [],
    "promotion_permissions": [],
    "infraction_permissions": [],
    "void_permissions": [],
    "appeal_accept_permissions": [],
    "partnership_approval_permissions": [],

    "bot_bypass_roles": [],
    "role_bypass_roles": [],

    "discord_suspended_role": None,
    "security_log_channel": None,

    "promotion_log_channel": None,
    "infraction_log_channel": None,
    "partnership_review_channel": None,
    "partnership_announcement_channel": None,
    "appeal_approval_channel": None,

    "weekly_quota_role": None,

    "ticket_categories": {},
    "ticket_human_role": None,
    "ticket_rules_channel": None,

    "punishment_roles": {
        "Strike 1": None,
        "Strike 2": None,
        "Strike 3": None,
        "Suspension": None,
        "Termination": None,
    },
}


# ==================================================
# JSON STORAGE HELPERS
# ==================================================

def read_json(path, fallback):
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return fallback


def write_json(path, data):
    temporary_file = path + ".tmp"

    with open(temporary_file, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4)

    os.replace(temporary_file, path)


# ==================================================
# SERVER CONFIGURATION STORAGE
# ==================================================

def load_server_configs():
    data = read_json(SERVER_CONFIG_FILE, {})
    return data if isinstance(data, dict) else {}


def save_server_configs(data):
    write_json(SERVER_CONFIG_FILE, data)


def get_server_config(guild_id):
    all_configs = load_server_configs()
    saved = all_configs.get(str(guild_id), {})

    config = json.loads(json.dumps(DEFAULT_CONFIG))

    if isinstance(saved, dict):
        config.update(saved)

        saved_punishments = saved.get("punishment_roles", {})

        if isinstance(saved_punishments, dict):
            config["punishment_roles"].update(saved_punishments)

    return config


def get_config(guild_id):
    """Backward-compatible alias for the server configuration getter."""
    return get_server_config(guild_id)


def set_server_config_value(guild_id, key, value):
    all_configs = load_server_configs()

    server = all_configs.setdefault(str(guild_id), {})
    server[key] = value

    save_server_configs(all_configs)


def set_config_value(guild_id, key, value):
    """Backward-compatible setter used by the /config commands."""
    set_server_config_value(guild_id, key, value)


def get_configured_roles(guild_id, key):
    values = get_server_config(guild_id).get(key, [])

    if not isinstance(values, list):
        return []

    result = []

    for value in values:
        try:
            result.append(int(value))
        except (TypeError, ValueError):
            continue

    return result


def member_has_configured_role(member, key):
    if not isinstance(member, discord.Member):
        return False

    allowed_roles = set(
        get_configured_roles(member.guild.id, key)
    )

    return any(
        role.id in allowed_roles
        for role in member.roles
    )


def get_configured_channel(guild, key):
    if guild is None:
        return None

    channel_id = get_server_config(guild.id).get(key)

    if not channel_id:
        return None

    try:
        return guild.get_channel(int(channel_id))
    except (TypeError, ValueError):
        return None


def get_configured_punishment_role(guild, punishment):
    config = get_server_config(guild.id)

    role_id = config.get("punishment_roles", {}).get(punishment)

    if not role_id:
        return None

    try:
        return guild.get_role(int(role_id))
    except (TypeError, ValueError):
        return None


def get_promotion_roles(guild):
    role_ids = get_configured_roles(
        guild.id,
        "promotion_ladder"
    )

    roles = [
        guild.get_role(role_id)
        for role_id in role_ids
    ]

    roles = [role for role in roles if role is not None]

    # Preserve the configured order.
    return roles


# ==================================================
# PERMISSION HELPERS
# ==================================================

def has_role(member, role_id):
    if not isinstance(member, discord.Member) or not role_id:
        return False

    try:
        role_id = int(role_id)
    except (TypeError, ValueError):
        return False

    return any(
        role.id == role_id
        for role in member.roles
    )


def is_management(member):
    return member_has_configured_role(
        member,
        "promotion_permissions"
    )


def can_issue_infractions(member, guild=None):
    return member_has_configured_role(
        member,
        "infraction_permissions"
    )


def can_promote(member, guild=None):
    return member_has_configured_role(
        member,
        "promotion_permissions"
    )


def can_void(member, guild=None):
    return member_has_configured_role(
        member,
        "void_permissions"
    )


def can_review_appeals(member, guild=None):
    return member_has_configured_role(
        member,
        "appeal_accept_permissions"
    )


def can_approve_partnerships(member, guild=None):
    return member_has_configured_role(
        member,
        "partnership_approval_permissions"
    )


def can_manage_discord_security(member, guild=None):
    return member_has_configured_role(
        member,
        "role_bypass_roles"
    )


def can_add_bots(member, guild=None):
    return member_has_configured_role(
        member,
        "bot_bypass_roles"
    )


# ==================================================
# SECURITY SUSPENSION STORAGE
# ==================================================

def load_security_suspensions():
    data = read_json(SECURITY_FILE, {})
    return data if isinstance(data, dict) else {}


def save_security_suspensions(data):
    write_json(SECURITY_FILE, data)


def security_member_key(guild_id, member_id):
    return f"{guild_id}:{member_id}"


def get_security_suspension(guild_id, member_id):
    data = load_security_suspensions()

    return data.get(
        security_member_key(guild_id, member_id)
    )


def save_security_suspension(
    guild_id,
    member_id,
    role_ids,
    reason,
    moderator_id=None
):
    data = load_security_suspensions()

    key = security_member_key(guild_id, member_id)

    data[key] = {
        "guild_id": guild_id,
        "member_id": member_id,
        "original_roles": list(dict.fromkeys(role_ids)),
        "reason": reason,
        "moderator_id": moderator_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "restoration_pending": True,
    }

    save_security_suspensions(data)


def delete_security_suspension(guild_id, member_id):
    data = load_security_suspensions()

    key = security_member_key(guild_id, member_id)

    if key in data:
        del data[key]
        save_security_suspensions(data)


# ==================================================
# CASE STORAGE
# ==================================================

def load_cases():
    data = read_json(CASE_FILE, [])

    if isinstance(data, dict):
        cases = data.get("cases", [])
        return cases if isinstance(cases, list) else []

    return data if isinstance(data, list) else []


def save_cases(cases):
    next_case = max(
        [
            int(case.get("id", 0))
            for case in cases
        ],
        default=0
    ) + 1

    write_json(
        CASE_FILE,
        {
            "next_case": next_case,
            "cases": cases
        }
    )


def create_case(
    case_type,
    member,
    moderator,
    reason,
    details=None,
    expires_at=None,
    punishment_role_id=None,
    roles_to_restore=None,
    guild_id=None
):
    cases = load_cases()

    case_id = max(
        [
            int(case.get("id", 0))
            for case in cases
        ],
        default=0
    ) + 1

    case = {
        "id": case_id,
        "case_id": case_id,
        "case_number": case_id,
        "guild_id": guild_id or member.guild.id,
        "type": case_type,
        "member_id": member.id,
        "member_name": str(member),
        "moderator_id": moderator.id,
        "moderator_name": str(moderator),
        "reason": reason,
        "details": details or "",
        "date": datetime.now(timezone.utc).isoformat(),
        "void": False,
        "voided": False,
        "appeal": None,
        "expires_at": expires_at,
        "punishment_role_id": punishment_role_id,
        "expired": False,
        "expired_at": None,
        "role_removed": False,
        "roles_to_restore": roles_to_restore or [],
    }

    cases.append(case)
    save_cases(cases)

    return case


def parse_expiration(value):
    if not value:
        return None

    try:
        expiration = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )

        if expiration.tzinfo is None:
            expiration = expiration.replace(
                tzinfo=timezone.utc
            )

        return expiration

    except (ValueError, AttributeError, TypeError):
        return None


# ==================================================
# WEEKLY QUOTA STORAGE
# ==================================================

def get_week_start():
    now = datetime.now(timezone.utc)

    days_since_sunday = (now.weekday() + 1) % 7
    sunday = now - timedelta(days=days_since_sunday)

    return sunday.date().isoformat()


def load_weekly_quota():
    current_week = get_week_start()
    data = read_json(WEEKLY_QUOTA_FILE, {})

    if (
        not isinstance(data, dict)
        or data.get("week_start") != current_week
    ):
        data = {
            "week_start": current_week,
            "counts": {}
        }

    if not isinstance(data.get("counts"), dict):
        data["counts"] = {}

    return data


def save_weekly_quota(data):
    write_json(WEEKLY_QUOTA_FILE, data)


def add_weekly_message(guild_id, member_id):
    data = load_weekly_quota()

    server_counts = data["counts"].setdefault(
        str(guild_id),
        {}
    )

    member_id = str(member_id)

    server_counts[member_id] = int(
        server_counts.get(member_id, 0)
    ) + 1

    save_weekly_quota(data)


def get_weekly_message_count(guild_id, member_id):
    data = load_weekly_quota()

    return int(
        data["counts"]
        .get(str(guild_id), {})
        .get(str(member_id), 0)
    )
# ==================================================
# AUTOMATIC PUNISHMENT EXPIRATION
# ==================================================

@tasks.loop(minutes=1)
async def expire_punishments():
    cases = load_cases()
    now = datetime.now(timezone.utc)
    changed = False

    for case in cases:
        if case.get("type") != "Infraction":
            continue

        if case.get("expired") or case.get("voided") or case.get("void"):
            continue

        expiration = parse_expiration(case.get("expires_at"))
        if expiration is None or expiration > now:
            continue

        try:
            guild = bot.get_guild(int(case.get("guild_id", 0)))
            if guild is None:
                continue

            member = await guild.fetch_member(int(case.get("member_id", 0)))
            punishment_role_id = case.get("punishment_role_id")

            if punishment_role_id:
                role = guild.get_role(int(punishment_role_id))
                if role and role in member.roles:
                    await member.remove_roles(
                        role, reason="Sentinel punishment expired"
                    )

            restored_roles = []
            bot_member = guild.me
            for role_id in case.get("roles_to_restore", []):
                role = guild.get_role(int(role_id))
                if (
                    role
                    and bot_member
                    and not role.is_default()
                    and role < bot_member.top_role
                    and role not in member.roles
                ):
                    restored_roles.append(role)

            if restored_roles:
                await member.add_roles(
                    *restored_roles,
                    reason="Sentinel punishment expired"
                )

            case["expired"] = True
            case["expired_at"] = now.isoformat()
            case["status"] = "Expired"
            changed = True
            print(f"[Sentinel] Expired case #{case.get('case_id', case.get('id'))}")

        except discord.NotFound:
            # Member or guild object no longer exists; leave the case unchanged.
            continue
        except discord.Forbidden:
            print(f"[Sentinel] Missing permissions while expiring case #{case.get('id')}")
        except discord.HTTPException as error:
            print(f"[Sentinel] Expiration error for case #{case.get('id')}: {error}")
        except (TypeError, ValueError) as error:
            print(f"[Sentinel] Invalid expiration data for case #{case.get('id')}: {error}")

    if changed:
        save_cases(cases)


@expire_punishments.before_loop
async def before_expire_punishments():
    await bot.wait_until_ready()


# ==================================================
# BOT SETUP AND COMMON HELPERS
# ==================================================

intents = discord.Intents.default()
intents.members = True
intents.message_content = True
intents.guilds = True

class SentinelBot(commands.Bot):
    async def setup_hook(self):
        # Register persistent views after all classes are loaded.
        self.add_view(AppealReviewView())
        self.add_view(PartnershipReviewView())
        self.add_view(TicketControlsView())
        for guild_id, saved_config in load_server_configs().items():
            categories = saved_config.get("ticket_categories", {}) if isinstance(saved_config, dict) else {}
            if categories:
                self.add_view(TicketPanelView(int(guild_id), categories))

        if not expire_punishments.is_running():
            expire_punishments.start()

    async def on_ready(self):
        # Always refresh guild command registrations on startup so newly added
        # commands (including /ticket and /ticketmanage) are published.
        for guild in self.guilds:
            try:
                self.tree.clear_commands(guild=guild)
                self.tree.copy_global_to(guild=guild)
                synced = await self.tree.sync(guild=guild)
                names = ", ".join(command.name for command in synced)
                print(
                    f"[Sentinel] Synced {len(synced)} commands to "
                    f"{guild.name} ({guild.id}): {names}"
                )
            except discord.HTTPException as error:
                print(
                    f"[Sentinel] FAILED syncing commands to "
                    f"{guild.name} ({guild.id}): {error}"
                )

        # Clear only the remote global registrations to avoid duplicate entries.
        # Restore local definitions afterward so they can be copied to new guilds.
        local_global_commands = self.tree.get_commands()
        try:
            self.tree.clear_commands(guild=None)
            await self.tree.sync()
        except discord.HTTPException as error:
            print(f"[Sentinel] Failed clearing global command registrations: {error}")
        finally:
            for command in local_global_commands:
                try:
                    self.tree.add_command(command)
                except app_commands.CommandAlreadyRegistered:
                    pass

    async def on_guild_join(self, guild):
        try:
            self.tree.clear_commands(guild=guild)
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            print(
                f"[Sentinel] Synced {len(synced)} commands to newly joined "
                f"server {guild.name} ({guild.id})."
            )
        except discord.HTTPException as error:
            print(
                f"[Sentinel] FAILED syncing commands to new server "
                f"{guild.name} ({guild.id}): {error}"
            )


bot = SentinelBot(
    command_prefix="!",
    intents=intents
)

bot.commands_synced = False


async def send_log(guild, channel_key, embed):
    channel = get_configured_channel(guild, channel_key)

    if channel is None:
        return False

    try:
        await channel.send(embed=embed)
        return True
    except discord.HTTPException:
        return False


def make_embed(title, description, color=discord.Color.blurple()):
    return discord.Embed(
        title=title,
        description=description,
        color=color,
        timestamp=datetime.now(timezone.utc)
    )


def bot_can_manage_role(guild, role):
    if role is None:
        return False

    bot_member = guild.me

    if bot_member is None:
        return False

    return (
        bot_member.guild_permissions.manage_roles
        and role < bot_member.top_role
        and not role.is_default()
        and not role.managed
    )


async def safe_add_roles(member, roles, reason=None):
    added = []

    for role in roles:
        if role in member.roles:
            continue

        if not bot_can_manage_role(member.guild, role):
            continue

        try:
            await member.add_roles(role, reason=reason)
            added.append(role)
        except discord.HTTPException:
            continue

    return added


async def safe_remove_roles(member, roles, reason=None):
    removed = []

    for role in roles:
        if role not in member.roles:
            continue

        if not bot_can_manage_role(member.guild, role):
            continue

        try:
            await member.remove_roles(role, reason=reason)
            removed.append(role)
        except discord.HTTPException:
            continue

    return removed


async def respond_error(interaction, message):
    if interaction.response.is_done():
        await interaction.followup.send(message, ephemeral=True)
    else:
        await interaction.response.send_message(message, ephemeral=True)


async def respond_success(interaction, message):
    if interaction.response.is_done():
        await interaction.followup.send(message, ephemeral=True)
    else:
        await interaction.response.send_message(message, ephemeral=True)


# ==================================================
# WEEKLY MESSAGE TRACKER
# ==================================================

@bot.event
async def on_message(message):

    # Ignore messages from bots
    if message.author.bot:
        return

    # Ignore direct messages
    if message.guild is None:
        return

    try:
        # Get this server's configuration
        config = get_config(message.guild.id)

        # Get configured weekly quota roles
        quota_role_ids = config.get("weekly_quota_role")

        # Support either one role ID or multiple role IDs
        if quota_role_ids is not None:

            if not isinstance(quota_role_ids, list):
                quota_role_ids = [quota_role_ids]

            quota_roles = []

            # Convert configured IDs into Discord roles
            for role_id in quota_role_ids:
                try:
                    role = message.guild.get_role(int(role_id))

                    if role is not None:
                        quota_roles.append(role)

                except (TypeError, ValueError):
                    continue

            # Check whether the member has at least one quota role
            member_has_quota_role = any(
                role in message.author.roles
                for role in quota_roles
            )

            # Count the message if the member qualifies
            if member_has_quota_role:
                add_weekly_message(
                    message.guild.id,
                    message.author.id
                )

    except Exception as error:
        print(
            f"[WEEKLY TRACKER ERROR] "
            f"Guild: {message.guild.id} | "
            f"Member: {message.author.id} | "
            f"Error: {error}"
        )

    # Free ticket troubleshooting and configured human handoff.
    try:
        await handle_ticket_support_message(message)
    except Exception as error:
        print(f"[Sentinel Ticket Support] Error in #{getattr(message.channel, 'name', 'unknown')}: {error}")

    # Keep prefix commands working
    await bot.process_commands(message)
# ==================================================
# PROMOTION COMMAND
# ==================================================

staff_group = app_commands.Group(
    name="staff",
    description="Staff management commands"
)


@staff_group.command(
    name="promote",
    description="Promote a staff member"
)
@app_commands.describe(
    member="Staff member to promote",
    reason="Reason for the promotion"
)
async def staff_promote(
    interaction: discord.Interaction,
    member: discord.Member,
    reason: str
):
    if not can_promote(interaction.user, interaction.guild):
        return await respond_error(
            interaction,
            "You do not have permission to promote staff."
        )

    if member.bot:
        return await respond_error(
            interaction,
            "Bots cannot be promoted."
        )

    promotion_roles = get_promotion_roles(interaction.guild)

    if len(promotion_roles) < 2:
        return await respond_error(
            interaction,
            "The promotion ladder is not configured. Use `/config` first."
        )

    current_role = None

    for role in promotion_roles:
        if role in member.roles:
            current_role = role

    if current_role is None:
        next_role = promotion_roles[0]
    else:
        current_index = promotion_roles.index(current_role)

        if current_index >= len(promotion_roles) - 1:
            return await respond_error(
                interaction,
                "This member is already at the highest configured promotion rank."
            )

        next_role = promotion_roles[current_index + 1]

    if not bot_can_manage_role(interaction.guild, next_role):
        return await respond_error(
            interaction,
            f"I cannot manage {next_role.mention}. Move my bot role above it."
        )

    await interaction.response.defer(ephemeral=True)

    # Promotions are additive: preserve existing staff roles and grant the
    # new rank without removing any previous roles.
    roles_to_remove = []

    try:
        if next_role not in member.roles:
            await member.add_roles(
                next_role,
                reason=f"Sentinel promotion by {interaction.user}"
            )

    except discord.HTTPException:
        return await interaction.followup.send(
            "I couldn't update the member's roles. Check my role hierarchy and permissions.",
            ephemeral=True
        )

    case = create_case(
        "Promotion",
        member,
        interaction.user,
        reason,
        f"Promoted to {next_role.name}",
        None,
        next_role.id,
        [role.id for role in roles_to_remove],
        guild_id=interaction.guild.id
    )

    embed = make_embed(
        "Staff Promotion",
        (
            f"**Member:** {member.mention}\n"
            f"**Promoted to:** {next_role.mention}\n"
            f"**Previous rank:** {current_role.mention if current_role else 'None'}\n"
            f"**Promoted by:** {interaction.user.mention}\n"
            f"**Reason:** {reason}\n"
            f"**Case ID:** `{case['case_id']}`"
        ),
        discord.Color.green()
    )

    await send_log(
        interaction.guild,
        "promotion_log_channel",
        embed
    )

    try:
        await member.send(
            embed=make_embed(
                "Staff Promotion",
                f"You have been promoted in **{interaction.guild.name}**.\n"
                f"**Your new role:** {next_role.name}\n"
                f"**Reason:** {reason}",
                discord.Color.green()
            )
        )
    except (discord.Forbidden, discord.HTTPException):
        # Closed DMs must never prevent the promotion or its audit log.
        pass

    await interaction.followup.send(
        f"Successfully promoted {member.mention} to {next_role.mention}.",
        ephemeral=True
    )


bot.tree.add_command(staff_group)


# ==================================================
# INFRACTION COMMAND
# ==================================================

infraction_group = app_commands.Group(
    name="infraction",
    description="Staff infraction management"
)


@infraction_group.command(
    name="issue",
    description="Issue a staff infraction"
)
@app_commands.describe(
    member="Member receiving the infraction",
    punishment="Punishment to issue",
    reason="Reason for the punishment",
    details="Additional information",
    duration="Required only for suspensions"
)
@app_commands.choices(
    punishment=[
        app_commands.Choice(name="Warning", value="Warning"),
        app_commands.Choice(name="Strike 1", value="Strike 1"),
        app_commands.Choice(name="Strike 2", value="Strike 2"),
        app_commands.Choice(name="Strike 3", value="Strike 3"),
        app_commands.Choice(name="Suspension", value="Suspension"),
        app_commands.Choice(name="Demotion", value="Demotion"),
        app_commands.Choice(name="Termination", value="Termination")
    ],
    duration=[
        app_commands.Choice(name="1 Hour", value="1h"),
        app_commands.Choice(name="6 Hours", value="6h"),
        app_commands.Choice(name="12 Hours", value="12h"),
        app_commands.Choice(name="1 Day", value="1d"),
        app_commands.Choice(name="3 Days", value="3d"),
        app_commands.Choice(name="7 Days", value="7d"),
        app_commands.Choice(name="30 Days", value="30d")
    ]
)
async def infraction_issue(
    interaction: discord.Interaction,
    member: discord.Member,
    punishment: app_commands.Choice[str],
    reason: str,
    details: str = "None",
    duration: app_commands.Choice[str] = None
):
    if not can_issue_infractions(interaction.user, interaction.guild):
        return await respond_error(
            interaction,
            "You do not have permission to issue infractions."
        )

    punishment_name = punishment.value

    if punishment_name == "Suspension" and duration is None:
        return await respond_error(
            interaction,
            "You must select a duration for a suspension."
        )

    if punishment_name != "Suspension" and duration is not None:
        return await respond_error(
            interaction,
            "A duration is only used for suspensions."
        )

    config = get_config(interaction.guild.id)
    punishment_role_id = get_configured_punishment_role(
        interaction.guild,
        punishment_name
    )

    expires_at = None

    if punishment_name == "Suspension":
        expires_at = (
            datetime.now(timezone.utc)
            + PUNISHMENT_DURATIONS[duration.value]
        ).isoformat()

        if punishment_role_id is None:
            return await respond_error(
                interaction,
                "A Suspension role has not been configured. Use `/config punishment_role`."
            )

    if punishment_name in {"Strike 1", "Strike 2", "Strike 3"}:
        if punishment_role_id is None:
            return await respond_error(
                interaction,
                f"The {punishment_name} role has not been configured."
            )

    await interaction.response.defer(ephemeral=True)

    roles_to_restore = []

    if punishment_name == "Suspension":
        suspended_role = interaction.guild.get_role(
            int(punishment_role_id)
        )

        if suspended_role is None:
            return await interaction.followup.send(
                "The configured Suspension role no longer exists.",
                ephemeral=True
            )

        roles_to_restore = [
            role.id for role in member.roles
            if not role.is_default()
            and role.id != suspended_role.id
            and role.id not in config.get("bot_bypass_roles", [])
        ]

        try:
            removable_roles = [
                role for role in member.roles
                if not role.is_default()
                and role != suspended_role
                and bot_can_manage_role(interaction.guild, role)
            ]

            if removable_roles:
                await member.remove_roles(
                    *removable_roles,
                    reason="Sentinel suspension"
                )

            await member.add_roles(
                suspended_role,
                reason="Sentinel suspension"
            )

        except discord.HTTPException:
            return await interaction.followup.send(
                "I couldn't apply the suspension. Check my role permissions and hierarchy.",
                ephemeral=True
            )

    elif punishment_name in {"Strike 1", "Strike 2", "Strike 3"}:
        role = interaction.guild.get_role(int(punishment_role_id))

        if role is None or not bot_can_manage_role(interaction.guild, role):
            return await interaction.followup.send(
                "I cannot manage the configured strike role.",
                ephemeral=True
            )

        try:
            await member.add_roles(
                role,
                reason=f"Sentinel {punishment_name}"
            )
        except discord.HTTPException:
            return await interaction.followup.send(
                "I couldn't apply the strike role.",
                ephemeral=True
            )

    elif punishment_name == "Demotion":
        promotion_roles = get_promotion_roles(interaction.guild)
        member_rank = next(
            (role for role in reversed(promotion_roles) if role in member.roles),
            None
        )

        if member_rank is None:
            return await interaction.followup.send(
                "This member does not have a configured promotion role.",
                ephemeral=True
            )

        index = promotion_roles.index(member_rank)

        if index == 0:
            return await interaction.followup.send(
                "This member is already at the lowest promotion rank.",
                ephemeral=True
            )

        lower_role = promotion_roles[index - 1]

        if not bot_can_manage_role(interaction.guild, lower_role):
            return await interaction.followup.send(
                "I cannot manage the lower promotion role.",
                ephemeral=True
            )

        try:
            await member.remove_roles(
                member_rank,
                reason="Sentinel demotion"
            )
            await member.add_roles(
                lower_role,
                reason="Sentinel demotion"
            )
        except discord.HTTPException:
            return await interaction.followup.send(
                "I couldn't apply the demotion.",
                ephemeral=True
            )

        punishment_role_id = lower_role.id

        try:
            await member.send(
                embed=make_embed(
                    "Staff Demotion",
                    f"You have been demoted in **{interaction.guild.name}**.\n"
                    f"**Your updated role:** {lower_role.name}\n"
                    f"**Reason:** {reason}",
                    discord.Color.orange()
                )
            )
        except (discord.Forbidden, discord.HTTPException):
            # Complete and log the demotion even if the member's DMs are closed.
            pass

    elif punishment_name == "Termination":
        promotion_roles = get_promotion_roles(interaction.guild)

        try:
            roles_to_remove = [
                role for role in promotion_roles
                if role in member.roles
                and bot_can_manage_role(interaction.guild, role)
            ]

            if roles_to_remove:
                await member.remove_roles(
                    *roles_to_remove,
                    reason="Sentinel termination"
                )

        except discord.HTTPException:
            return await interaction.followup.send(
                "I couldn't remove the member's promotion roles.",
                ephemeral=True
            )

    case = create_case(
        "Infraction",
        member,
        interaction.user,
        reason,
        details,
        expires_at,
        punishment_role_id,
        roles_to_restore,
        guild_id=interaction.guild.id
    )

    embed = make_embed(
        "Staff Infraction",
        (
            f"**Member:** {member.mention}\n"
            f"**Punishment:** {punishment_name}\n"
            f"**Issued by:** {interaction.user.mention}\n"
            f"**Reason:** {reason}\n"
            f"**Details:** {details}\n"
            f"**Duration:** {duration.name if duration else 'Permanent / Not required'}\n"
            f"**Case ID:** `{case['case_id']}`"
        ),
        discord.Color.red()
    )

    await send_log(
        interaction.guild,
        "infraction_log_channel",
        embed
    )

    await interaction.followup.send(
        f"Successfully issued **{punishment_name}** to {member.mention}. Case ID: `{case['case_id']}`",
        ephemeral=True
    )


bot.tree.add_command(infraction_group)
# ==================================================
# WEEKLY QUOTA COMMAND
# ==================================================

weekly_group = app_commands.Group(
    name="weekly",
    description="Weekly staff activity"
)


@weekly_group.command(
    name="quota",
    description="View the weekly message quota leaderboard"
)
async def weekly_quota(interaction: discord.Interaction):
    guild = interaction.guild
    config = get_config(guild.id)
    quota_role_id = config.get("weekly_quota_role")

    if not quota_role_id:
        return await respond_error(
            interaction,
            "The weekly quota role has not been configured."
        )

    quota_role = guild.get_role(int(quota_role_id))

    if quota_role is None:
        return await respond_error(
            interaction,
            "The configured weekly quota role no longer exists."
        )

    members = [
        member for member in quota_role.members
        if not member.bot
    ]

    members.sort(
        key=lambda member: get_weekly_message_count(
            guild.id,
            member.id
        ),
        reverse=True
    )

    embed = make_embed(
        "Weekly Staff Quota",
        f"Required messages: **{WEEKLY_QUOTA}**",
        discord.Color.blurple()
    )

    if not members:
        embed.description += "\n\nNo members currently have the quota role."
    else:
        lines = []

        for index, member in enumerate(members[:20], start=1):
            count = get_weekly_message_count(guild.id, member.id)
            status = "Complete" if count >= WEEKLY_QUOTA else "In progress"

            lines.append(
                f"**{index}.** {member.mention} — `{count}/{WEEKLY_QUOTA}` — {status}"
            )

        embed.add_field(
            name="Leaderboard",
            value="\n".join(lines),
            inline=False
        )

    await interaction.response.send_message(
        embed=embed,
        ephemeral=True
    )


bot.tree.add_command(weekly_group)


# ==================================================
# CASE HISTORY COMMAND
# ==================================================

@bot.tree.command(
    name="history",
    description="View a member's Sentinel case history"
)
@app_commands.describe(
    member="Member whose history you want to view"
)
async def history_command(
    interaction: discord.Interaction,
    member: discord.Member
):
    if not can_void(interaction.user, interaction.guild):
        return await respond_error(
            interaction,
            "You do not have permission to view staff case history."
        )

    cases = load_cases()

    member_cases = [
        case for case in cases
        if str(case.get("guild_id")) == str(interaction.guild.id)
        and str(case.get("member_id")) == str(member.id)
    ]

    member_cases.sort(
        key=lambda case: case.get("created_at", ""),
        reverse=True
    )

    embed = make_embed(
        f"Case History — {member}",
        f"Total cases: **{len(member_cases)}**",
        discord.Color.blurple()
    )

    if not member_cases:
        embed.description += "\n\nNo cases were found for this member."
    else:
        for case in member_cases[:10]:
            status = (
                "Voided" if case.get("voided")
                else "Expired" if case.get("expired")
                else "Active"
            )

            embed.add_field(
                name=f"Case {case.get('case_id', 'Unknown')} — {status}",
                value=(
                    f"**Type:** {case.get('case_type', 'Unknown')}\n"
                    f"**Punishment:** {case.get('punishment', 'Unknown')}\n"
                    f"**Reason:** {case.get('reason', 'None')}\n"
                    f"**Details:** {case.get('details', 'None')}"
                ),
                inline=False
            )

    await interaction.response.send_message(
        embed=embed,
        ephemeral=True
    )


# ==================================================
# VOID CASE COMMAND
# ==================================================

@bot.tree.command(
    name="void",
    description="Void a staff case and restore the member's saved roles."
)
@app_commands.describe(
    case_number="The ID of the case you want to void",
    reason="Why this case is being voided"
)
async def void_case(
    interaction: discord.Interaction,
    case_number: int,
    reason: str
):

    # ----------------------------------------------
    # BASIC CHECKS
    # ----------------------------------------------

    if interaction.guild is None:
        await interaction.response.send_message(
            "This command can only be used inside a server.",
            ephemeral=True
        )
        return

    if not can_void(interaction.user):
        await interaction.response.send_message(
            "You do not have permission to void cases.",
            ephemeral=True
        )
        return

    await interaction.response.defer(ephemeral=True)

    guild = interaction.guild

    # ----------------------------------------------
    # FIND CASE
    # ----------------------------------------------

    cases = load_cases()

    case = None

    if isinstance(cases, dict):
        case = cases.get(str(case_number))

        if case is None:
            for stored_case in cases.values():
                if isinstance(stored_case, dict):
                    stored_id = stored_case.get(
                        "id",
                        stored_case.get("case_id")
                    )

                    if str(stored_id) == str(case_number):
                        case = stored_case
                        break

    elif isinstance(cases, list):
        for stored_case in cases:
            if isinstance(stored_case, dict):
                stored_id = stored_case.get(
                    "id",
                    stored_case.get("case_id")
                )

                if str(stored_id) == str(case_number):
                    case = stored_case
                    break

    if case is None:
        await interaction.followup.send(
            f"Case `{case_number}` could not be found.",
            ephemeral=True
        )
        return

    # ----------------------------------------------
    # CHECK CASE STATUS
    # ----------------------------------------------

    if case.get("voided", False):
        await interaction.followup.send(
            "This case has already been voided.",
            ephemeral=True
        )
        return

    if str(case.get("status", "")).lower() == "voided":
        await interaction.followup.send(
            "This case has already been voided.",
            ephemeral=True
        )
        return

    # ----------------------------------------------
    # FIND MEMBER
    # ----------------------------------------------

    member_id = case.get("member_id")

    if not member_id:
        await interaction.followup.send(
            "This case does not contain a member ID.",
            ephemeral=True
        )
        return

    member = guild.get_member(int(member_id))

    if member is None:
        try:
            member = await guild.fetch_member(int(member_id))
        except discord.NotFound:
            await interaction.followup.send(
                "The member from this case is no longer in the server. "
                "The case can be voided, but their roles cannot be restored "
                "until they rejoin.",
                ephemeral=True
            )
            return
        except discord.HTTPException:
            await interaction.followup.send(
                "I couldn't retrieve the member. Please try again.",
                ephemeral=True
            )
            return

    # ----------------------------------------------
    # CHECK BOT PERMISSIONS
    # ----------------------------------------------

    if not guild.me.guild_permissions.manage_roles:
        await interaction.followup.send(
            "I need the **Manage Roles** permission to restore roles.",
            ephemeral=True
        )
        return

    bot_top_role = guild.me.top_role

    # ----------------------------------------------
    # RESTORE SAVED ROLES
    # ----------------------------------------------

    restoration_notes = []

    roles_to_restore = case.get(
        "roles_to_restore",
        case.get("roles_to_restore_on_void", [])
    )

    punishment_role_id = case.get("punishment_role_id")

    roles_to_add = []

    for role_id in roles_to_restore:
        try:
            role = guild.get_role(int(role_id))
        except (TypeError, ValueError):
            continue

        if role is None:
            restoration_notes.append(
                f"Role `{role_id}` no longer exists."
            )
            continue

        if role.is_default():
            continue

        if role >= bot_top_role:
            restoration_notes.append(
                f"Could not restore **{role.name}** because it is "
                "above my highest role."
            )
            continue

        if role not in member.roles and role not in roles_to_add:
            roles_to_add.append(role)

    # ----------------------------------------------
    # REMOVE PUNISHMENT ROLE
    # ----------------------------------------------

    punishment_role_removed = False

    if punishment_role_id:
        try:
            punishment_role = guild.get_role(
                int(punishment_role_id)
            )
        except (TypeError, ValueError):
            punishment_role = None

        if punishment_role is not None:
            if punishment_role in member.roles:
                if punishment_role < bot_top_role:
                    try:
                        await member.remove_roles(
                            punishment_role,
                            reason=f"Case #{case_number} voided"
                        )
                        punishment_role_removed = True
                    except discord.HTTPException:
                        restoration_notes.append(
                            f"Could not remove punishment role "
                            f"**{punishment_role.name}**."
                        )
                else:
                    restoration_notes.append(
                        f"Could not remove **{punishment_role.name}** "
                        "because it is above my highest role."
                    )

    # ----------------------------------------------
    # ADD RESTORED ROLES
    # ----------------------------------------------

    if roles_to_add:
        try:
            await member.add_roles(
                *roles_to_add,
                reason=f"Case #{case_number} voided"
            )

            restoration_notes.append(
                "Restored: " + ", ".join(
                    role.name for role in roles_to_add
                )
            )

        except discord.HTTPException:
            restoration_notes.append(
                "Discord rejected the role restoration. "
                "Check my role hierarchy and permissions."
            )

    # ----------------------------------------------
    # UPDATE CASE
    # ----------------------------------------------

    case["voided"] = True
    case["status"] = "Voided"
    case["voided_by"] = interaction.user.id
    case["void_reason"] = reason
    case["voided_at"] = datetime.now(timezone.utc).isoformat()
    case["roles_restored_on_void"] = [
        role.id for role in roles_to_add
    ]
    case["punishment_role_removed_on_void"] = (
        punishment_role_removed
    )

    save_cases(cases)

    # ----------------------------------------------
    # MEMBER DISPLAY
    # ----------------------------------------------

    member_display = (
        member.mention
        if member
        else f"`{member_id}`"
    )

    restoration_text = (
        "\n".join(restoration_notes)
        if restoration_notes
        else "No role restoration was needed."
    )

    # ----------------------------------------------
    # CREATE VOID EMBED
    # ----------------------------------------------

    embed = make_embed(
        "Case Voided",
        (
            f"**Case ID:** `{case_number}`\n"
            f"**Member:** {member_display}\n"
            f"**Voided by:** {interaction.user.mention}\n"
            f"**Reason:** {reason}\n\n"
            f"**Role restoration:**\n{restoration_text}"
        ),
        discord.Color.orange()
    )

    # ----------------------------------------------
    # SEND LOG
    # ----------------------------------------------

    log_channel = get_configured_channel(
        guild,
        "infraction_log_channel"
    )

    if log_channel:
        try:
            await log_channel.send(embed=embed)
        except discord.HTTPException:
            pass

    # ----------------------------------------------
    # CONFIRMATION
    # ----------------------------------------------

    await interaction.followup.send(
        f"Case `{case_number}` has been voided.\n"
        f"Member: {member.mention}\n"
        f"Role restoration: {restoration_text}",
        ephemeral=True
    )


# ==================================================
# MODERATION COMMANDS
# ==================================================

@bot.tree.command(name="mute", description="Timeout a member for a specified duration")
@app_commands.describe(member="Member to timeout", duration="How long the timeout lasts", reason="Reason for the timeout")
@app_commands.choices(duration=[
    app_commands.Choice(name="60 seconds", value="60"),
    app_commands.Choice(name="5 minutes", value="300"),
    app_commands.Choice(name="10 minutes", value="600"),
    app_commands.Choice(name="1 hour", value="3600"),
    app_commands.Choice(name="1 day", value="86400"),
    app_commands.Choice(name="7 days", value="604800"),
    app_commands.Choice(name="28 days", value="2419200"),
])
@app_commands.checks.has_permissions(moderate_members=True)
@app_commands.checks.bot_has_permissions(moderate_members=True)
async def mute_command(
    interaction: discord.Interaction,
    member: discord.Member,
    duration: app_commands.Choice[str],
    reason: str = "No reason provided"
):
    if member.id == interaction.user.id:
        return await interaction.response.send_message("You can't timeout yourself.", ephemeral=True)
    if member.id == interaction.guild.owner_id or member.top_role >= interaction.user.top_role:
        return await interaction.response.send_message("You can't timeout this member because of their role hierarchy.", ephemeral=True)
    seconds = int(duration.value)
    until = discord.utils.utcnow() + timedelta(seconds=seconds)
    try:
        await member.timeout(until, reason=f"{interaction.user}: {reason}")
    except discord.Forbidden:
        return await interaction.response.send_message("I don't have permission to timeout that member.", ephemeral=True)
    await interaction.response.send_message(
        f"🔇 Timed out {member.mention} for **{duration.name}**.\nReason: {reason}",
        ephemeral=True
    )


@bot.tree.command(name="ban", description="Ban a member from this server")
@app_commands.describe(member="Member to ban", reason="Reason for the ban", delete_message_days="Days of recent messages to delete (0-7)")
@app_commands.checks.has_permissions(ban_members=True)
@app_commands.checks.bot_has_permissions(ban_members=True)
async def ban_command(
    interaction: discord.Interaction,
    member: discord.Member,
    reason: str = "No reason provided",
    delete_message_days: app_commands.Range[int, 0, 7] = 0
):
    if member.id == interaction.user.id:
        return await interaction.response.send_message("You can't ban yourself.", ephemeral=True)
    if member.id == interaction.guild.owner_id or member.top_role >= interaction.user.top_role:
        return await interaction.response.send_message("You can't ban this member because of their role hierarchy.", ephemeral=True)
    try:
        await interaction.guild.ban(
            member, reason=f"{interaction.user}: {reason}",
            delete_message_seconds=delete_message_days * 86400
        )
    except discord.Forbidden:
        return await interaction.response.send_message("I don't have permission to ban that member.", ephemeral=True)
    await interaction.response.send_message(f"🔨 Banned **{member}**.\nReason: {reason}", ephemeral=True)


@bot.tree.command(name="kick", description="Kick a member from this server")
@app_commands.describe(member="Member to kick", reason="Reason for the kick")
@app_commands.checks.has_permissions(kick_members=True)
@app_commands.checks.bot_has_permissions(kick_members=True)
async def kick_command(
    interaction: discord.Interaction,
    member: discord.Member,
    reason: str = "No reason provided"
):
    if member.id == interaction.user.id:
        return await interaction.response.send_message("You can't kick yourself.", ephemeral=True)
    if member.id == interaction.guild.owner_id or member.top_role >= interaction.user.top_role:
        return await interaction.response.send_message("You can't kick this member because of their role hierarchy.", ephemeral=True)
    try:
        await member.kick(reason=f"{interaction.user}: {reason}")
    except discord.Forbidden:
        return await interaction.response.send_message("I don't have permission to kick that member.", ephemeral=True)
    await interaction.response.send_message(f"👢 Kicked **{member}**.\nReason: {reason}", ephemeral=True)


@bot.tree.command(name="unban", description="Unban a user from this server")
@app_commands.describe(user_id="The numeric Discord user ID", reason="Reason for the unban")
@app_commands.checks.has_permissions(ban_members=True)
@app_commands.checks.bot_has_permissions(ban_members=True)
async def unban_command(
    interaction: discord.Interaction,
    user_id: str,
    reason: str = "No reason provided"
):
    try:
        target_id = int(user_id)
        if target_id <= 0:
            raise ValueError
    except ValueError:
        return await interaction.response.send_message("Enter a valid numeric Discord user ID.", ephemeral=True)
    try:
        entry = await interaction.guild.fetch_ban(discord.Object(id=target_id))
    except discord.NotFound:
        return await interaction.response.send_message("That user is not banned from this server.", ephemeral=True)
    except discord.Forbidden:
        return await interaction.response.send_message("I don't have permission to view or remove bans.", ephemeral=True)
    try:
        await interaction.guild.unban(entry.user, reason=f"{interaction.user}: {reason}")
    except discord.Forbidden:
        return await interaction.response.send_message("I don't have permission to unban that user.", ephemeral=True)
    await interaction.response.send_message(f"Unbanned **{entry.user}**.\nReason: {reason}", ephemeral=True)




# ==================================================
# FREE BUILT-IN TICKET SUPPORT + HUMAN HANDOFF
# ==================================================

def ticket_record_for_channel(channel):
    """Return the stored ticket record, or None if this is not a Sentinel ticket."""
    if not isinstance(channel, discord.TextChannel):
        return None

    tickets = load_tickets()
    record = tickets.get(str(channel.id))
    if isinstance(record, dict):
        return record

    # Backward-compatible fallback for older ticket channels.
    topic = channel.topic or ""
    if "Sentinel ticket" not in topic:
        return None

    parsed = {}
    for part in topic.split("|"):
        part = part.strip()
        if "=" in part:
            key, value = part.split("=", 1)
            parsed[key.strip()] = value.strip()

    try:
        owner_id = int(parsed.get("owner", 0))
        staff_role_id = int(parsed.get("role", 0))
    except (TypeError, ValueError):
        return None

    if not owner_id:
        return None

    return {
        "guild_id": channel.guild.id,
        "owner_id": owner_id,
        "staff_role_id": staff_role_id,
        "closed": "closed=true" in topic,
        "claimed_by": None,
        "_legacy_record": True,
    }


def built_in_ticket_troubleshooting(user_text: str) -> str:
    """Simple rules-based support; runs locally and does not call a paid API."""
    text = (user_text or "").lower()

    if any(word in text for word in ("verify", "verification", "captcha", "verification code")):
        return (
            "🔎 **Verification troubleshooting**\n"
            "1. Check that you're using the correct verification channel or button.\n"
            "2. Make sure you completed every step and accepted any server rules prompt.\n"
            "3. If a verification message or button is missing, tell staff what you see and when it started.\n"
            "If it still doesn't work, type **human** or **person** and I'll notify the configured staff role."
        )

    if any(word in text for word in ("permission", "can't see", "cannot see", "access", "role", "channel")):
        return (
            "🛠️ **Role / channel access troubleshooting**\n"
            "1. Check whether you have the required server role.\n"
            "2. Confirm the channel is visible in the correct category.\n"
            "3. If you recently received a role, try rejoining the channel or ask staff to recheck its permissions.\n"
            "Don't share passwords or private account details here. Type **human** or **person** for staff help."
        )

    if any(word in text for word in ("command", "slash", "bot", "not responding", "offline")):
        return (
            "🤖 **Bot / command troubleshooting**\n"
            "1. Make sure you're using the command in a server channel where the bot is present.\n"
            "2. Try selecting the command from Discord's `/` command picker instead of typing it manually.\n"
            "3. Check that the bot has permission to view and respond in that channel.\n"
            "4. If the command is missing, ask an administrator to check the bot's command sync and invite permissions.\n"
            "Type **human** or **person** if you'd like staff to take over."
        )

    if any(word in text for word in ("ticket", "close ticket", "open ticket")):
        return (
            "🎟️ **Ticket troubleshooting**\n"
            "1. Use the ticket panel button to open a new ticket.\n"
            "2. Check whether you already have an open ticket for that category.\n"
            "3. Keep the details of your issue in this ticket so staff can review them.\n"
            "Type **human** or **person** to notify the configured staff role."
        )

    if any(word in text for word in ("error", "bug", "broken", "crash", "failed", "doesn't work", "not working")):
        return (
            "🧰 **General troubleshooting**\n"
            "1. Try the action once more and note the exact error message.\n"
            "2. Tell us what you were trying to do and what happened instead.\n"
            "3. Include the channel or command involved, but never post passwords, tokens, or API keys.\n"
            "Type **human** or **person** if you want a staff member to help."
        )

    if any(word in text for word in ("account", "login", "log in", "username", "password")):
        return (
            "🔐 **Account help**\n"
            "Please describe the account issue and any non-sensitive error message you're seeing. "
            "Never post your password, login codes, recovery codes, or other private credentials in a ticket. "
            "Type **human** or **person** to request staff assistance."
        )

    return (
        "👁️ **Sentinel Support**\n"
        "I can provide basic built-in troubleshooting for verification, roles and permissions, "
        "bot commands, tickets, and common errors. Tell me what you're trying to do and the exact "
        "message or problem you're seeing. Type **human** or **person** at any time to request staff."
    )


def is_server_rules_question(user_text: str) -> bool:
    """Recognize questions that should be answered from the configured server rules."""
    text = (user_text or "").lower()
    indicators = (
        "rule", "rules", "allowed", "allow", "can i", "am i allowed",
        "punishment", "punished", "warning", "warnings", "strike",
        "ban", "banned", "mute", "muted", "advertis", "promotion",
        "swear", "swearing", "harass", "harassment", "spam",
        "alt account", "alternate account", "staff policy", "appeal",
        "what happens if", "is it against"
    )
    return any(term in text for term in indicators)


async def get_server_rules_answer(guild: discord.Guild, question: str):
    """Find relevant passages in the administrator-selected rules/knowledge channel.

    This is a local keyword-retrieval system, not a generative model. It quotes
    only text actually found in the configured channel and declines when no
    relevant passage can be found.
    """
    cfg = get_server_config(guild.id)
    try:
        channel_id = int(cfg.get("ticket_rules_channel") or 0)
    except (TypeError, ValueError):
        channel_id = 0

    rules_channel = guild.get_channel(channel_id) if channel_id else None
    if not isinstance(rules_channel, (discord.TextChannel, discord.Thread)):
        return None, "not_configured"

    # Read a bounded recent window. The bot needs View Channel and Read Message History.
    entries = []
    try:
        async for msg in rules_channel.history(limit=100, oldest_first=True):
            if msg.author.bot and not (msg.content or msg.embeds):
                continue
            parts = []
            if msg.content:
                parts.append(msg.content)
            for embed in msg.embeds:
                if embed.title:
                    parts.append(embed.title)
                if embed.description:
                    parts.append(embed.description)
                for field in embed.fields:
                    parts.extend([field.name, field.value])
            content = "\n".join(part.strip() for part in parts if part and part.strip())
            if content:
                entries.append(content[:5000])
    except (discord.Forbidden, discord.HTTPException):
        return None, "unreadable"

    if not entries:
        return None, "empty"

    # Rank messages by meaningful words shared with the question.
    stop_words = {
        "what", "whats", "what's", "are", "the", "is", "a", "an", "and",
        "or", "to", "in", "on", "for", "of", "i", "we", "you", "our",
        "server", "please", "tell", "me", "about", "do", "does", "can",
        "could", "would", "should", "am", "it", "if", "my", "this", "that"
    }
    question_words = {
        word for word in re.findall(r"[a-z0-9']+", question.lower())
        if len(word) > 2 and word not in stop_words
    }
    if not question_words:
        return None, "no_match"

    ranked = []
    for entry in entries:
        words = set(re.findall(r"[a-z0-9']+", entry.lower()))
        overlap = question_words & words
        if overlap:
            # Favor passages matching several distinct question terms.
            ranked.append((len(overlap), entry))
    ranked.sort(key=lambda item: item[0], reverse=True)

    if not ranked:
        return None, "no_match"

    best_score = ranked[0][0]
    if best_score < 1:
        return None, "no_match"

    selected = [entry for score, entry in ranked if score >= max(1, best_score - 1)][:3]
    answer = "\n\n".join(selected)
    if len(answer) > 1700:
        answer = answer[:1697].rstrip() + "..."
    return answer, "ok"


async def handle_ticket_support_message(message: discord.Message):
    """Handle owner messages in open tickets without any external AI/API dependency."""
    if message.guild is None or message.author.bot:
        return

    record = ticket_record_for_channel(message.channel)
    if not record or record.get("closed"):
        return

    # Only the ticket creator's messages should trigger automated support/handoff.
    try:
        owner_id = int(record.get("owner_id", 0))
    except (TypeError, ValueError):
        return
    if message.author.id != owner_id:
        return

    text = (message.content or "").strip()
    if not text:
        return

    # Match whole words so phrases like "human resources" also count as a request;
    # the role is only pinged once per ticket to avoid repeated notifications.
    if re.search(r"\b(?:human|person)\b", text, flags=re.IGNORECASE):
        cfg = get_server_config(message.guild.id)
        try:
            role_id = int(cfg.get("ticket_human_role") or 0)
        except (TypeError, ValueError):
            role_id = 0
        role = message.guild.get_role(role_id) if role_id else None

        tickets = load_tickets()
        stored = tickets.get(str(message.channel.id), record)
        if stored.get("human_pinged"):
            await message.channel.send(
                "🙋 Staff have already been notified for this ticket. Please wait for someone to respond."
            )
            return

        if role is None:
            await message.channel.send(
                "I can hand this over to staff, but an administrator hasn't configured the "
                "**Ticket Human Support Role** yet. An administrator can set it in `/config`."
            )
            return

        stored["human_pinged"] = True
        stored["human_pinged_at"] = datetime.now(timezone.utc).isoformat()
        stored["human_pinged_by"] = message.author.id
        tickets[str(message.channel.id)] = stored
        save_tickets(tickets)

        await message.channel.send(
            content=(
                f"{role.mention} — {message.author.mention} requested a human staff member. "
                "Please take a look at this ticket."
            ),
            allowed_mentions=discord.AllowedMentions(
                roles=[role], users=[message.author], everyone=False
            )
        )
        return

    # Answer server-policy questions from the channel selected in /config.
    if is_server_rules_question(text):
        rules_answer, rules_status = await get_server_rules_answer(message.guild, text)
        if rules_status == "ok" and rules_answer:
            await message.channel.send(
                "📚 **Server Rules / Policy Information**\n"
                f"{rules_answer}\n\n"
                "If this doesn't fully answer your question, type **human** or **person** for staff."
            )
            return
        if rules_status == "not_configured":
            await message.channel.send(
                "📚 I don't have a server rules/knowledge channel configured yet. "
                "An administrator can select one in `/config` → "
                "**Server Rules / Support Knowledge Channel**. "
                "Type **human** or **person** if you need staff now."
            )
            return
        if rules_status == "unreadable":
            await message.channel.send(
                "📚 I can't read the configured rules channel. Please ask an administrator "
                "to check my **View Channel** and **Read Message History** permissions. "
                "Type **human** or **person** for staff."
            )
            return
        await message.channel.send(
            "📚 I couldn't find that answer in the configured rules/knowledge channel, "
            "so I don't want to guess. Type **human** or **person** and I'll notify staff."
        )
        return

    # Free local troubleshooting: no OpenAI key, paid API, or external request.
    await message.channel.send(built_in_ticket_troubleshooting(text))


# ==================================================
# TICKET SYSTEM
# ==================================================

TICKET_FILE = "tickets.json"


def ticket_slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
    return value[:40] or "support"


def load_tickets():
    data = read_json(TICKET_FILE, {})
    return data if isinstance(data, dict) else {}


def save_tickets(data):
    write_json(TICKET_FILE, data)


def ticket_categories_for(guild_id):
    categories = get_server_config(guild_id).get("ticket_categories", {})
    return categories if isinstance(categories, dict) else {}


def register_ticket_panel_view(guild_id):
    categories = ticket_categories_for(guild_id)
    if categories:
        bot.add_view(TicketPanelView(guild_id, categories))



class TicketCategoryButton(discord.ui.Button):
    def __init__(self, guild_id: int, key: str, details: dict, position: int):
        label = str(details.get("button_label") or details.get("name", key))[:80]
        super().__init__(
            label=label,
            style=discord.ButtonStyle.secondary,
            custom_id=f"sentinel_ticket_open:{guild_id}:{key}",
            row=position // 5
        )
        self.guild_id = guild_id
        self.category_key = key

    async def callback(self, interaction: discord.Interaction):
        if interaction.guild is None or interaction.guild.id != self.guild_id:
            return await interaction.response.send_message(
                "This ticket panel belongs to another server.", ephemeral=True
            )
        categories = ticket_categories_for(self.guild_id)
        details = categories.get(self.category_key)
        if not isinstance(details, dict):
            return await interaction.response.send_message(
                "This ticket category is no longer configured.", ephemeral=True
            )

        guild, member = interaction.guild, interaction.user
        staff_role = guild.get_role(int(details.get("role_id", 0)))
        if staff_role is None:
            return await interaction.response.send_message(
                "The assigned staff role no longer exists. Ask an administrator to update this category.",
                ephemeral=True
            )
        bot_member = guild.me
        if bot_member is None or not bot_member.guild_permissions.manage_channels:
            return await interaction.response.send_message(
                "I need the **Manage Channels** permission to create tickets.", ephemeral=True
            )

        for channel in guild.text_channels:
            topic = channel.topic or ""
            if (f"owner={member.id}" in topic
                    and f"category={self.category_key}" in topic
                    and "closed=true" not in topic):
                return await interaction.response.send_message(
                    f"You already have an open ticket for this category: {channel.mention}",
                    ephemeral=True
                )

        await interaction.response.defer(ephemeral=True, thinking=True)
        overwrites = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            member: discord.PermissionOverwrite(
                view_channel=True, send_messages=True, read_message_history=True,
                attach_files=True, embed_links=True
            ),
            bot_member: discord.PermissionOverwrite(
                view_channel=True, send_messages=True, read_message_history=True,
                manage_channels=True, manage_messages=True
            ),
            staff_role: discord.PermissionOverwrite(
                view_channel=True, send_messages=True, read_message_history=True,
                attach_files=True, embed_links=True
            )
        }

        category_name = str(details.get("name", self.category_key))
        channel_name = f"ticket-{ticket_slug(category_name)}-{ticket_slug(member.name)}"
        try:
            ticket_channel = await guild.create_text_channel(
                name=channel_name[:95],
                overwrites=overwrites,
                topic=(
                    f"Sentinel ticket | owner={member.id} | role={staff_role.id} | "
                    f"category={self.category_key} | closed=false | claimed_by=0"
                ),
                reason=f"Ticket opened by {member} ({member.id})"
            )
            ticket_embed = discord.Embed(
                title=f"{category_name} Ticket",
                description=(
                    f"Welcome {member.mention}! Your ticket has been created.\n\n"
                    f"{details.get('welcome_message', 'Please explain how our team can help you.')}"
                    f"\n\nAssigned team: <@&{staff_role.id}>"
                ),
                color=discord.Color.from_str(
                    str(get_server_config(guild.id).get("ticket_panel_color", "#27274B"))
                    if re.fullmatch(r"#[0-9a-fA-F]{6}", str(get_server_config(guild.id).get("ticket_panel_color", "#27274B")))
                    else "#27274B"
                ),
                timestamp=datetime.now(timezone.utc)
            )
            ticket_embed.set_footer(text="Sentinel Ticket System")
            await ticket_channel.send(
                content=f"{member.mention} <@&{staff_role.id}>",
                embed=ticket_embed,
                view=TicketControlsView(),
                allowed_mentions=discord.AllowedMentions(users=[member], roles=[staff_role])
            )
            tickets = load_tickets()
            tickets[str(ticket_channel.id)] = {
                "guild_id": guild.id, "owner_id": member.id,
                "staff_role_id": staff_role.id, "category": self.category_key,
                "opened_at": datetime.now(timezone.utc).isoformat(),
                "closed": False, "claimed_by": None
            }
            save_tickets(tickets)
        except discord.Forbidden:
            return await interaction.followup.send(
                "I couldn't create the ticket. Check my **Manage Channels** permission.",
                ephemeral=True
            )
        except discord.HTTPException as error:
            print(f"[Sentinel] Ticket creation failed: {error}")
            return await interaction.followup.send(
                "Discord couldn't create the ticket. Please try again.", ephemeral=True
            )

        await interaction.followup.send(
            f"Your private ticket is ready: {ticket_channel.mention}", ephemeral=True
        )


class TicketPanelView(discord.ui.View):
    def __init__(self, guild_id: int, categories: dict):
        super().__init__(timeout=None)
        for index, (key, details) in enumerate(categories.items()):
            if index >= 10:
                break
            if isinstance(details, dict):
                self.add_item(TicketCategoryButton(guild_id, key, details, index))


class TicketControlsView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Claim Ticket", style=discord.ButtonStyle.success,
        emoji="🙋", custom_id="sentinel_ticket_claim"
    )
    async def claim_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        channel, guild = interaction.channel, interaction.guild
        if guild is None or not isinstance(channel, discord.TextChannel):
            return await interaction.response.send_message("Use this inside a ticket channel.", ephemeral=True)

        tickets = load_tickets()
        record = tickets.get(str(channel.id), {})
        if not record and "Sentinel ticket" not in (channel.topic or ""):
            return await interaction.response.send_message("This is not a Sentinel ticket.", ephemeral=True)

        role_id = int(record.get("staff_role_id", 0))
        if not role_id:
            match = re.search(r"role=(\d+)", channel.topic or "")
            role_id = int(match.group(1)) if match else 0
        staff_role = guild.get_role(role_id)
        member = interaction.user
        if not isinstance(member, discord.Member) or not (
            member.guild_permissions.manage_channels or (staff_role and staff_role in member.roles)
        ):
            return await interaction.response.send_message(
                "Only the assigned staff team can claim this ticket.", ephemeral=True
            )

        claimed_by = record.get("claimed_by")
        if claimed_by:
            claimant = guild.get_member(int(claimed_by))
            return await interaction.response.send_message(
                f"This ticket has already been claimed by {claimant.mention if claimant else 'another staff member'}.",
                ephemeral=True
            )

        record["claimed_by"] = member.id
        record["claimed_at"] = datetime.now(timezone.utc).isoformat()
        tickets[str(channel.id)] = record
        save_tickets(tickets)
        topic = channel.topic or ""
        topic = re.sub(r"claimed_by=\d+", f"claimed_by={member.id}", topic)
        try:
            await channel.edit(topic=topic, reason=f"Ticket claimed by {member}")
        except discord.HTTPException:
            pass
        for child in self.children:
            if isinstance(child, discord.ui.Button) and child.custom_id == "sentinel_ticket_claim":
                child.disabled = True
                child.label = "Claimed"
        await interaction.response.send_message(f"🙋 Ticket claimed by {member.mention}.")
        try:
            await interaction.message.edit(view=self)
        except discord.HTTPException:
            pass

    @discord.ui.button(
        label="Close Ticket", style=discord.ButtonStyle.danger,
        emoji="🔒", custom_id="sentinel_ticket_close"
    )
    async def close_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        await close_sentinel_ticket(interaction)


async def close_sentinel_ticket(interaction: discord.Interaction):
    channel, guild = interaction.channel, interaction.guild
    if guild is None or not isinstance(channel, discord.TextChannel):
        return await interaction.response.send_message("Use this inside a ticket channel.", ephemeral=True)

    tickets = load_tickets()
    record = tickets.get(str(channel.id), {})
    topic = channel.topic or ""
    if not record and "Sentinel ticket" not in topic:
        return await interaction.response.send_message("This is not a Sentinel ticket.", ephemeral=True)

    if not record:
        parsed = {}
        for part in topic.split("|"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                parsed[k] = v
        record = {
            "owner_id": parsed.get("owner", 0),
            "staff_role_id": parsed.get("role", 0)
        }

    owner_id = int(record.get("owner_id", 0))
    role_id = int(record.get("staff_role_id", 0))
    staff_role = guild.get_role(role_id)
    member = interaction.user
    is_owner = member.id == owner_id
    is_staff = isinstance(member, discord.Member) and staff_role in member.roles if staff_role else False
    is_admin = isinstance(member, discord.Member) and member.guild_permissions.manage_channels
    if not (is_owner or is_staff or is_admin):
        return await interaction.response.send_message(
            "Only the ticket creator, assigned staff, or a channel manager can close this ticket.",
            ephemeral=True
        )

    await interaction.response.send_message(
        "🔒 Ticket closed. This channel will be deleted in 5 seconds.", ephemeral=True
    )
    record.update({
        "closed": True, "closed_by": member.id,
        "closed_at": datetime.now(timezone.utc).isoformat()
    })
    tickets[str(channel.id)] = record
    save_tickets(tickets)
    await channel.send(
        embed=discord.Embed(
            title="Ticket Closed",
            description=f"Closed by {member.mention}. This channel will now be deleted.",
            color=discord.Color.red()
        )
    )
    await asyncio.sleep(5)
    try:
        await channel.delete(reason=f"Ticket closed by {member} ({member.id})")
    except discord.Forbidden:
        await interaction.followup.send(
            "I couldn't delete this channel. Please grant me **Manage Channels**.",
            ephemeral=True
        )
    except discord.NotFound:
        pass


@bot.tree.command(
    name="ticketcategory",
    description="Add or update a ticket category and its assigned staff role"
)
@app_commands.guild_only()
@app_commands.checks.has_permissions(manage_guild=True)
@app_commands.describe(
    name="The category name shown on the ticket panel",
    staff_role="Only this staff role and the ticket creator can view tickets in this category",
    description="Optional short description shown in the panel"
)
async def ticket_category_command(
    interaction: discord.Interaction,
    name: app_commands.Range[str, 2, 50],
    staff_role: discord.Role,
    description: app_commands.Range[str, 1, 100] = None
):
    guild = interaction.guild
    if staff_role.is_default() or staff_role.managed:
        return await interaction.response.send_message(
            "Choose a normal server role for ticket staff.",
            ephemeral=True
        )

    key = ticket_slug(name)
    config = get_server_config(guild.id)
    categories = config.get("ticket_categories", {})
    if not isinstance(categories, dict):
        categories = {}

    if key not in categories and len(categories) >= 10:
        return await interaction.response.send_message(
            "A server can have up to 10 ticket categories. Remove one before adding another.",
            ephemeral=True
        )

    categories[key] = {
        "name": name,
        "role_id": staff_role.id,
        "description": description or f"Open a {name} ticket"
    }
    set_server_config_value(guild.id, "ticket_categories", categories)
    register_ticket_panel_view(guild.id)

    await interaction.response.send_message(
        f"Ticket category **{name}** is configured. Assigned staff role: {staff_role.mention}.\n"
        "Use `/ticketpanel` to send or refresh the ticket panel.",
        ephemeral=True
    )



class TicketManageCategorySelect(discord.ui.Select):
    def __init__(self, guild_id: int, categories: dict):
        self.guild_id = guild_id
        options = []
        for key, details in list(categories.items())[:25]:
            if isinstance(details, dict):
                options.append(discord.SelectOption(
                    label=str(details.get("name", key))[:100],
                    value=str(key)[:100],
                    description=f"Staff role ID: {details.get('role_id', 'unknown')}"[:100]
                ))
        super().__init__(
            placeholder="Select a ticket type to manage...",
            min_values=1, max_values=1, options=options
        )

    async def callback(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_guild:
            return await interaction.response.send_message("Manage Server permission required.", ephemeral=True)
        key = self.values[0]
        categories = ticket_categories_for(self.guild_id)
        details = categories.get(key)
        if not isinstance(details, dict):
            return await interaction.response.send_message("That ticket type no longer exists.", ephemeral=True)
        role = interaction.guild.get_role(int(details.get("role_id", 0)))
        embed = discord.Embed(
            title=f"Managing: {details.get('name', key)}",
            description=(
                f"**Category key:** `{key}`\n"
                f"**Assigned staff:** {role.mention if role else 'Role missing'}\n"
                f"**Description:** {details.get('description', 'No description set')}\n\n"
                "Use `/ticketcategory` with the same name to update its assigned staff role or description."
            ),
            color=discord.Color.blurple()
        )
        self.view.selected_key = key
        await interaction.response.edit_message(embed=embed, view=self.view)



class TicketPanelDescriptionModal(discord.ui.Modal):
    def __init__(self, guild_id: int):
        super().__init__(title="Edit Ticket Panel Description")
        self.guild_id = guild_id
        current = get_server_config(guild_id).get("ticket_panel_description") or (
            "Need assistance?\n\nSelect a button below to open a private ticket."
        )
        self.description_input = discord.ui.TextInput(
            label="Panel Description",
            style=discord.TextStyle.paragraph,
            placeholder="Write the message members will see above the ticket buttons...",
            default=str(current)[:4000],
            required=True,
            min_length=1,
            max_length=4000
        )
        self.add_item(self.description_input)

    async def on_submit(self, interaction: discord.Interaction):
        description = self.description_input.value.strip()
        set_server_config_value(self.guild_id, "ticket_panel_description", description)

        # Update the already-posted panel when possible, so changes are visible immediately.
        cfg = get_server_config(self.guild_id)
        channel_id = cfg.get("ticket_panel_channel")
        message_id = cfg.get("ticket_panel_message_id")
        updated_existing = False
        if channel_id and message_id:
            channel = interaction.guild.get_channel(int(channel_id))
            if isinstance(channel, discord.TextChannel):
                try:
                    message = await channel.fetch_message(int(message_id))
                    title = str(cfg.get("ticket_panel_name") or "Sentinel Support")[:256]
                    color_text = str(cfg.get("ticket_panel_color") or "#27274B")
                    color = (
                        discord.Color.from_str(color_text)
                        if re.fullmatch(r"#[0-9a-fA-F]{6}", color_text)
                        else discord.Color.blurple()
                    )
                    embed = discord.Embed(title=title, description=description, color=color)
                    await message.edit(
                        embed=embed,
                        view=TicketPanelView(self.guild_id, ticket_categories_for(self.guild_id))
                    )
                    updated_existing = True
                except (discord.NotFound, discord.Forbidden, discord.HTTPException):
                    pass

        message = "✅ Ticket panel description saved."
        if updated_existing:
            message += " The existing panel has also been updated."
        else:
            message += " Run `/ticketpanel` to publish the updated panel."
        await interaction.response.send_message(message, ephemeral=True)


class TicketManageView(discord.ui.View):
    def __init__(self, guild_id: int, categories: dict):
        super().__init__(timeout=300)
        self.guild_id = guild_id
        self.selected_key = None
        if categories:
            self.add_item(TicketManageCategorySelect(guild_id, categories))

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if not interaction.user.guild_permissions.manage_guild:
            await interaction.response.send_message("Manage Server permission required.", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="Edit Panel Description", style=discord.ButtonStyle.secondary, emoji="📝")
    async def edit_panel_description(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(TicketPanelDescriptionModal(self.guild_id))

    @discord.ui.button(label="Post / Refresh Panel", style=discord.ButtonStyle.primary, emoji="📨")
    async def publish_panel(self, interaction: discord.Interaction, button: discord.ui.Button):
        categories = ticket_categories_for(self.guild_id)
        if not categories:
            return await interaction.response.send_message("Add a ticket type first with `/ticketcategory`.", ephemeral=True)
        cfg = get_server_config(self.guild_id)
        destination = interaction.guild.get_channel(int(cfg.get("ticket_panel_channel") or 0)) if cfg.get("ticket_panel_channel") else interaction.channel
        if destination is None:
            destination = interaction.channel
        title = str(cfg.get("ticket_panel_name") or "Sentinel Support")[:256]
        description = str(cfg.get("ticket_panel_description") or "Need assistance?\n\nSelect a button below to open a private ticket.")[:4000]
        color_text = str(cfg.get("ticket_panel_color") or "#27274B")
        color = discord.Color.from_str(color_text) if re.fullmatch(r"#[0-9a-fA-F]{6}", color_text) else discord.Color.blurple()
        embed = discord.Embed(title=title, description=description, color=color)
        try:
            message = await destination.send(embed=embed, view=TicketPanelView(self.guild_id, categories))
        except discord.Forbidden:
            return await interaction.response.send_message("I cannot post in that channel. Check my channel permissions.", ephemeral=True)
        set_server_config_value(self.guild_id, "ticket_panel_channel", destination.id)
        set_server_config_value(self.guild_id, "ticket_panel_message_id", message.id)
        set_server_config_value(self.guild_id, "ticket_panel_posted", True)
        await interaction.response.send_message(f"Ticket panel posted in {destination.mention}.", ephemeral=True)

    @discord.ui.button(label="Delete Selected Type", style=discord.ButtonStyle.danger, emoji="🗑️")
    async def delete_category(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not self.selected_key:
            return await interaction.response.send_message("Select a ticket type first.", ephemeral=True)
        categories = ticket_categories_for(self.guild_id)
        removed = categories.pop(self.selected_key, None)
        if removed is None:
            return await interaction.response.send_message("That ticket type no longer exists.", ephemeral=True)
        set_server_config_value(self.guild_id, "ticket_categories", categories)
        self.selected_key = None
        await interaction.response.edit_message(
            content="Ticket type deleted. Existing ticket channels are not affected.",
            embed=ticket_manage_embed(interaction.guild),
            view=TicketManageView(self.guild_id, categories)
        )


def ticket_manage_embed(guild: discord.Guild):
    categories = ticket_categories_for(guild.id)
    cfg = get_server_config(guild.id)
    channel = guild.get_channel(int(cfg.get("ticket_panel_channel") or 0)) if cfg.get("ticket_panel_channel") else None
    embed = discord.Embed(
        title="🎟️ Sentinel Ticket Management",
        description=(
            "Manage ticket types, assigned staff teams, and your public ticket panel.\n\n"
            f"**Panel:** {cfg.get('ticket_panel_name') or 'Sentinel Support'}\n"
            f"**Panel channel:** {channel.mention if channel else 'Not configured'}\n"
            f"**Ticket types:** {len(categories)} / 10\n\n"
            "Select a ticket type below to inspect it. Use `/ticketcategory` to add or update a type."
        ),
        color=discord.Color.blurple()
    )
    for key, details in list(categories.items())[:10]:
        role = guild.get_role(int(details.get("role_id", 0))) if isinstance(details, dict) else None
        embed.add_field(
            name=str(details.get("name", key)) if isinstance(details, dict) else key,
            value=f"Assigned team: {role.mention if role else 'Role missing'}",
            inline=True
        )
    if not categories:
        embed.add_field(name="No ticket types yet", value="Create one with `/ticketcategory`.", inline=False)
    return embed


@bot.tree.command(name="ticket", description="Open the Sentinel ticket management dashboard")
@app_commands.guild_only()
@app_commands.checks.has_permissions(manage_guild=True)
async def ticket_manage_alias_command(interaction: discord.Interaction):
    categories = ticket_categories_for(interaction.guild.id)
    await interaction.response.send_message(
        embed=ticket_manage_embed(interaction.guild),
        view=TicketManageView(interaction.guild.id, categories),
        ephemeral=True
    )


@bot.tree.command(name="ticketmanage", description="Open the Sentinel ticket management dashboard")
@app_commands.guild_only()
@app_commands.checks.has_permissions(manage_guild=True)
async def ticket_manage_command(interaction: discord.Interaction):
    categories = ticket_categories_for(interaction.guild.id)
    await interaction.response.send_message(
        embed=ticket_manage_embed(interaction.guild),
        view=TicketManageView(interaction.guild.id, categories),
        ephemeral=True
    )


@bot.tree.command(
    name="ticketpanel",
    description="Post or refresh the Sentinel ticket panel"
)
@app_commands.guild_only()
@app_commands.checks.has_permissions(manage_guild=True)
@app_commands.describe(channel="Where to post the ticket panel (optional)")
async def ticket_panel_command(
    interaction: discord.Interaction,
    channel: discord.TextChannel = None
):
    guild = interaction.guild
    categories = ticket_categories_for(guild.id)
    if not categories:
        return await interaction.response.send_message(
            "No ticket categories are configured yet. Add them with `/ticketcategory` first.",
            ephemeral=True
        )
    bot_member = guild.me
    if bot_member is None or not bot_member.guild_permissions.manage_channels:
        return await interaction.response.send_message(
            "I need **Manage Channels** to create private ticket channels.", ephemeral=True
        )

    cfg = get_server_config(guild.id)
    destination = channel
    if destination is None and cfg.get("ticket_panel_channel"):
        destination = guild.get_channel(int(cfg["ticket_panel_channel"]))
    if destination is None:
        destination = interaction.channel
    title = str(cfg.get("ticket_panel_name") or "Sentinel Support")[:256]
    description = str(cfg.get("ticket_panel_description") or (
        "Need assistance?\n\n"
        "Staff Support - Questions or partnerships.\n\n"
        "High Rank Support - Reports, important questions, staff fast pass, or collaborations.\n\n"
        "Executive Support - URGENT support for only the most important cases."
    ))[:4000]
    color_text = str(cfg.get("ticket_panel_color") or "#27274B")
    color = discord.Color.from_str(color_text) if re.fullmatch(r"#[0-9a-fA-F]{6}", color_text) else discord.Color.from_rgb(39, 39, 75)
    panel = discord.Embed(title=title, description=description, color=color)
    panel_view = TicketPanelView(guild.id, categories)

    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        message = await destination.send(embed=panel, view=panel_view)
    except discord.Forbidden:
        return await interaction.followup.send(
            f"I can't post in {destination.mention}. Check **View Channel** and **Send Messages**.",
            ephemeral=True
        )
    except discord.HTTPException as error:
        print(f"[Sentinel] Ticket panel send failed: {error}")
        return await interaction.followup.send("Discord couldn't post the ticket panel.", ephemeral=True)

    set_server_config_value(guild.id, "ticket_panel_channel", destination.id)
    set_server_config_value(guild.id, "ticket_panel_message_id", message.id)
    set_server_config_value(guild.id, "ticket_panel_posted", True)
    register_ticket_panel_view(guild.id)
    await interaction.followup.send(
        f"✅ Sentinel ticket panel posted in {destination.mention}.", ephemeral=True
    )



# ==================================================
# SINGLE CONFIGURATION DASHBOARD
# ==================================================

CONFIG_SETTINGS = [
    ("promotion_ladder", "Promotion ladder", "roles"),
    ("promotion_permissions", "Promotion permissions", "roles"),
    ("infraction_permissions", "Infraction permissions", "roles"),
    ("void_permissions", "Void permissions", "roles"),
    ("appeal_accept_permissions", "Appeal permissions", "roles"),
    ("partnership_approval_permissions", "Partnership approval roles", "roles"),
    ("bot_bypass_roles", "Bot bypass roles", "roles"),
    ("role_bypass_roles", "Security bypass roles", "roles"),
    ("discord_suspended_role", "Discord suspended role", "role"),
    ("weekly_quota_role", "Weekly quota role", "role"),
    ("security_log_channel", "Security log channel", "channel"),
    ("promotion_log_channel", "Promotion log channel", "channel"),
    ("infraction_log_channel", "Infraction log channel", "channel"),
    ("partnership_review_channel", "Partnership review channel", "channel"),
    ("partnership_announcement_channel", "Partnership announcement channel", "channel"),
    ("appeal_approval_channel", "Appeal approval channel", "channel"),
    ("ticket_panel_channel", "Ticket panel channel", "channel"),
    ("ticket_human_role", "Ticket Human Support Role", "role"),
    ("ticket_rules_channel", "Server Rules / Support Knowledge Channel", "channel"),
    ("punishment:Strike 1", "Strike 1 role", "role"),
    ("punishment:Strike 2", "Strike 2 role", "role"),
    ("punishment:Strike 3", "Strike 3 role", "role"),
    ("punishment:Suspension", "Suspension role", "role"),
    ("punishment:Termination", "Termination role", "role"),
]


def config_dashboard_embed(guild: discord.Guild):
    cfg = get_server_config(guild.id)
    def status(key):
        value = cfg.get(key)
        if isinstance(value, list):
            return f"✅ `{len(value)}` configured" if value else "❌"
        return "✅" if value else "❌"

    embed = discord.Embed(
        title="👁️ Welcome to Sentinel",
        description=(
            "👁️ Hi, and thank you for choosing **Sentinel**, a multipurpose "
            "security bot made for you. You can edit everything with the menu below!"
        ),
        color=discord.Color.from_rgb(39, 39, 75)
    )
    embed.add_field(
        name="⚙️ Configuration",
        value=(
            f"› Promotion Ladder: {status('promotion_ladder')}\n"
            f"› Promotion Permissions: {status('promotion_permissions')}\n"
            f"› Infraction Permissions: {status('infraction_permissions')}\n"
            f"› Void Permissions: {status('void_permissions')}\n"
            f"› Appeal Permissions: {status('appeal_accept_permissions')}\n"
            f"› Partnership Approval: {status('partnership_approval_permissions')}\n"
            f"› Security Log Channel: {status('security_log_channel')}\n"
            f"› Promotion Log Channel: {status('promotion_log_channel')}\n"
            f"› Infraction Log Channel: {status('infraction_log_channel')}\n"
            f"› Review / Announcement Channels: "
            f"{status('partnership_review_channel')} / {status('partnership_announcement_channel')}\n"
            f"› Appeal Channel: {status('appeal_approval_channel')}\n"
            f"› Weekly Quota Role: {status('weekly_quota_role')}\n"
            f"› Suspended Role: {status('discord_suspended_role')}\n"
        ),
        inline=False
    )
    ticket_categories = cfg.get("ticket_categories", {})
    panel_channel = guild.get_channel(int(cfg.get("ticket_panel_channel") or 0)) if cfg.get("ticket_panel_channel") else None
    panel_color = cfg.get("ticket_panel_color") or "#27274B"
    panel_details = (
        f"› Name: **{cfg.get('ticket_panel_name') or 'Sentinel Support'}**\n"
        f"› Panel Channel: {panel_channel.mention if panel_channel else '❌ Not set'}\n"
        f"› Posted: {'✅' if cfg.get('ticket_panel_posted') else '❌'}\n"
        f"› Accent Color: `{panel_color}`\n"
        f"› Display: **Buttons**\n"
        f"› Placement: **Inside Embed**\n"
        f"› Blacklist Roles: **0**\n"
        f"› Panel Blocks: **1**\n"
        f"› Ticket Types: **{len(ticket_categories)} / 10**\n"
        f"› Human Support Role: {guild.get_role(int(cfg.get('ticket_human_role') or 0)).mention if cfg.get('ticket_human_role') and guild.get_role(int(cfg.get('ticket_human_role'))) else '❌ Not set'}"
    )
    embed.add_field(name="🎟️ Ticket Panel", value=panel_details, inline=False)
    rules_channel = guild.get_channel(int(cfg.get("ticket_rules_channel") or 0)) if cfg.get("ticket_rules_channel") else None
    embed.add_field(
        name="📚 Support Knowledge",
        value=f"› Rules / Knowledge Channel: {rules_channel.mention if rules_channel else '❌ Not set'}",
        inline=False
    )
    embed.add_field(
        name="🛡️ Permissions",
        value=(
            f"› Bot Bypass Roles: {status('bot_bypass_roles')}\n"
            f"› Manager / Security Bypass: {status('role_bypass_roles')}"
        ),
        inline=False
    )
    punishment_lines = []
    for name in PUNISHMENT_NAMES:
        rid = cfg.get("punishment_roles", {}).get(name)
        role = guild.get_role(int(rid)) if rid else None
        punishment_lines.append(f"› {name}: {role.mention if role else '❌'}")
    embed.add_field(name="⚖️ Punishment Roles", value="\n".join(punishment_lines), inline=False)
    embed.set_footer(text=f"{guild.name} • Select a setting below to edit it")
    return embed


class ConfigSettingSelect(discord.ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(label=label, value=key, description=f"Edit {label.lower()}")
            for key, label, _kind in CONFIG_SETTINGS
        ]
        super().__init__(
            placeholder="Edit configuration...",
            min_values=1, max_values=1, options=options
        )

    async def callback(self, interaction: discord.Interaction):
        key = self.values[0]
        label, kind = next((label, kind) for k, label, kind in CONFIG_SETTINGS if k == key)
        view = ConfigEditView(interaction.user.id, key, label, kind)
        await interaction.response.edit_message(
            content=f"**Editing: {label}**\nChoose the value below, then return to the dashboard.",
            embed=config_dashboard_embed(interaction.guild),
            view=view
        )


class ConfigRoleSelect(discord.ui.RoleSelect):
    def __init__(self, owner_id, key, label, multiple):
        self.owner_id, self.key, self.label, self.multiple = owner_id, key, label, multiple
        super().__init__(
            placeholder=f"Select {label.lower()}",
            min_values=0,
            max_values=25 if multiple else 1
        )

    async def callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.owner_id:
            return await interaction.response.send_message("Only the administrator who opened this menu can edit it.", ephemeral=True)
        guild = interaction.guild
        selected = list(self.values)
        if self.key.startswith("punishment:"):
            cfg = get_server_config(guild.id)
            punishment = self.key.split(":", 1)[1]
            cfg["punishment_roles"][punishment] = selected[0].id if selected else None
            set_config_value(guild.id, "punishment_roles", cfg["punishment_roles"])
        elif self.multiple:
            if self.key == "promotion_ladder":
                selected.sort(key=lambda role: role.position)
            set_config_value(guild.id, self.key, [role.id for role in selected])
        else:
            set_config_value(guild.id, self.key, selected[0].id if selected else None)
        await interaction.response.edit_message(
            content=f"✅ Updated **{self.label}**.",
            embed=config_dashboard_embed(guild),
            view=ConfigDashboardView(self.owner_id)
        )


class ConfigChannelSelect(discord.ui.ChannelSelect):
    def __init__(self, owner_id, key, label):
        self.owner_id, self.key, self.label = owner_id, key, label
        super().__init__(
            placeholder=f"Select {label.lower()}",
            min_values=0, max_values=1,
            channel_types=[discord.ChannelType.text, discord.ChannelType.news]
        )

    async def callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.owner_id:
            return await interaction.response.send_message("Only the administrator who opened this menu can edit it.", ephemeral=True)
        channel = self.values[0] if self.values else None
        set_config_value(interaction.guild.id, self.key, channel.id if channel else None)
        await interaction.response.edit_message(
            content=f"✅ Updated **{self.label}**.",
            embed=config_dashboard_embed(interaction.guild),
            view=ConfigDashboardView(self.owner_id)
        )


class ConfigEditView(discord.ui.View):
    def __init__(self, owner_id, key, label, kind):
        super().__init__(timeout=300)
        self.owner_id = owner_id
        multiple = kind == "roles"
        if kind in ("roles", "role"):
            self.add_item(ConfigRoleSelect(owner_id, key, label, multiple))
        else:
            self.add_item(ConfigChannelSelect(owner_id, key, label))
        self.add_item(ConfigBackButton(owner_id))


class ConfigBackButton(discord.ui.Button):
    def __init__(self, owner_id):
        super().__init__(label="Back to configuration", style=discord.ButtonStyle.secondary)
        self.owner_id = owner_id

    async def callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.owner_id:
            return await interaction.response.send_message("Only the administrator who opened this menu can use it.", ephemeral=True)
        await interaction.response.edit_message(
            content="Choose a setting from **Edit configuration...**.",
            embed=config_dashboard_embed(interaction.guild),
            view=ConfigDashboardView(self.owner_id)
        )



class TicketPanelEditSelect(discord.ui.Select):
    def __init__(self, owner_id):
        self.owner_id = owner_id
        options = [
            discord.SelectOption(label="Panel Name", value="ticket_panel_name", description="Change the panel title"),
            discord.SelectOption(label="Panel Description", value="ticket_panel_description", description="Change the panel text"),
            discord.SelectOption(label="Accent Color", value="ticket_panel_color", description="Set a HEX color"),
        ]
        super().__init__(placeholder="Edit this panel...", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.owner_id:
            return await interaction.response.send_message("Only the administrator who opened this menu can edit it.", ephemeral=True)
        key = self.values[0]
        await interaction.response.send_modal(TicketPanelValueModal(self.owner_id, interaction.guild.id, key))


class TicketPanelValueModal(discord.ui.Modal):
    def __init__(self, owner_id, guild_id, key):
        self.owner_id, self.guild_id, self.key = owner_id, guild_id, key
        labels = {
            "ticket_panel_name": ("Panel Name", 1, 100),
            "ticket_panel_description": ("Panel Description", 1, 4000),
            "ticket_panel_color": ("Accent Color (HEX)", 7, 7)
        }
        label, min_len, max_len = labels[key]
        super().__init__(title=f"Edit {label}")
        self.value_input = discord.ui.TextInput(
            label=label, required=True, min_length=min_len, max_length=max_len,
            style=discord.TextStyle.paragraph if key == "ticket_panel_description" else discord.TextStyle.short,
            default=str(get_server_config(self.guild_id).get(key) or (
                "#27274B" if key == "ticket_panel_color" else
                "Sentinel Support" if key == "ticket_panel_name" else
                "Need assistance?\n\nStaff Support - Questions or partnerships.\n\nHigh Rank Support - Reports, important questions, staff fast pass, or collaborations.\n\nExecutive Support - URGENT support for only the most important cases."
            ))
        )
        self.add_item(self.value_input)

    async def on_submit(self, interaction: discord.Interaction):
        value = self.value_input.value.strip()
        if self.key == "ticket_panel_color" and not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            return await interaction.response.send_message("Enter a HEX color such as `#27274B`.", ephemeral=True)
        set_server_config_value(interaction.guild.id, self.key, value)
        await interaction.response.send_message(
            f"✅ Updated the ticket panel. Run `/ticketpanel` to publish the changes.",
            ephemeral=True
        )


class ConfigDashboardView(discord.ui.View):
    def __init__(self, owner_id):
        super().__init__(timeout=300)
        self.owner_id = owner_id
        self.add_item(ConfigSettingSelect())
        self.add_item(TicketPanelEditSelect(owner_id))

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.owner_id:
            await interaction.response.send_message(
                "Only the administrator who opened this configuration menu can use it.",
                ephemeral=True
            )
            return False
        return True


@bot.tree.command(name="config", description="Open the server configuration dashboard")
@app_commands.checks.has_permissions(administrator=True)
async def config_dashboard_command(interaction: discord.Interaction):
    view = ConfigDashboardView(interaction.user.id)
    await interaction.response.send_message(
        "Choose a setting from **Edit configuration...**.",
        embed=config_dashboard_embed(interaction.guild),
        view=view,
        ephemeral=True
    )


# ==================================================
# CONFIGURATION COMMANDS
# ==================================================

config_group = app_commands.Group(
    name="config",
    description="Configure Sentinel for this server"
)


def config_permission(interaction):
    return (
        interaction.user.guild_permissions.administrator
        or interaction.user.id == interaction.guild.owner_id
    )


async def config_check(interaction):
    if not config_permission(interaction):
        await respond_error(
            interaction,
            "Only server administrators can change Sentinel configuration."
        )
        return False

    return True


def add_role_to_config(guild, key, role):
    config = get_config(guild.id)
    role_ids = [
        int(value) for value in config.get(key, [])
    ]

    if role.id not in role_ids:
        role_ids.append(role.id)

    if key == "promotion_ladder":
        role_ids.sort(
            key=lambda role_id: (
                guild.get_role(role_id).position
                if guild.get_role(role_id) else -1
            )
        )

    set_config_value(guild.id, key, role_ids)


def remove_role_from_config(guild, key, role):
    config = get_config(guild.id)
    role_ids = [
        int(value) for value in config.get(key, [])
    ]

    if role.id in role_ids:
        role_ids.remove(role.id)

    set_config_value(guild.id, key, role_ids)


@config_group.command(
    name="promotion_add",
    description="Add a role to the promotion ladder"
)
async def config_promotion_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    if not await config_check(interaction):
        return

    add_role_to_config(
        interaction.guild,
        "promotion_ladder",
        role
    )

    await respond_success(
        interaction,
        f"Added {role.mention} to the promotion ladder. The ladder follows Discord role hierarchy."
    )


@config_group.command(
    name="promotion_remove",
    description="Remove a role from the promotion ladder"
)
async def config_promotion_remove(
    interaction: discord.Interaction,
    role: discord.Role
):
    if not await config_check(interaction):
        return

    remove_role_from_config(
        interaction.guild,
        "promotion_ladder",
        role
    )

    await respond_success(
        interaction,
        f"Removed {role.mention} from the promotion ladder."
    )


@config_group.command(
    name="promotion_list",
    description="View the configured promotion ladder"
)
async def config_promotion_list(
    interaction: discord.Interaction
):
    config = get_config(interaction.guild.id)
    roles = get_promotion_roles(interaction.guild)

    if not roles:
        return await respond_error(
            interaction,
            "No promotion roles have been configured."
        )

    description = "\n".join(
        f"**{index}.** {role.mention}"
        for index, role in enumerate(roles, start=1)
    )

    await interaction.response.send_message(
        embed=make_embed(
            "Promotion Ladder",
            description,
            discord.Color.blurple()
        ),
        ephemeral=True
    )


async def configure_permission_role(
    interaction,
    key,
    role,
    action
):
    if not await config_check(interaction):
        return

    config = get_config(interaction.guild.id)
    role_ids = [
        int(value) for value in config.get(key, [])
    ]

    if action == "add":
        if role.id not in role_ids:
            role_ids.append(role.id)
    else:
        if role.id in role_ids:
            role_ids.remove(role.id)

    set_config_value(interaction.guild.id, key, role_ids)

    await respond_success(
        interaction,
        f"Updated `{key}`. Role: {role.mention}."
    )


@config_group.command(
    name="promotion_permission_add",
    description="Allow a role to promote staff"
)
async def config_promotion_permission_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "promotion_permissions",
        role,
        "add"
    )


@config_group.command(
    name="promotion_permission_remove",
    description="Remove a role's promotion permission"
)
async def config_promotion_permission_remove(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "promotion_permissions",
        role,
        "remove"
    )


@config_group.command(
    name="infraction_permission_add",
    description="Allow a role to issue infractions"
)
async def config_infraction_permission_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "infraction_permissions",
        role,
        "add"
    )


@config_group.command(
    name="infraction_permission_remove",
    description="Remove a role's infraction permission"
)
async def config_infraction_permission_remove(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "infraction_permissions",
        role,
        "remove"
    )


@config_group.command(
    name="void_permission_add",
    description="Allow a role to void cases"
)
async def config_void_permission_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "void_permissions",
        role,
        "add"
    )


@config_group.command(
    name="void_permission_remove",
    description="Remove a role's void permission"
)
async def config_void_permission_remove(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "void_permissions",
        role,
        "remove"
    )


@config_group.command(
    name="appeal_permission_add",
    description="Allow a role to accept appeals"
)
async def config_appeal_permission_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "appeal_accept_permissions",
        role,
        "add"
    )


@config_group.command(
    name="partnership_permission_add",
    description="Allow a role to approve partnerships"
)
async def config_partnership_permission_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "partnership_approval_permissions",
        role,
        "add"
    )


@config_group.command(
    name="bot_bypass_add",
    description="Allow a role to bypass bot-add security checks"
)
async def config_bot_bypass_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "bot_bypass_roles",
        role,
        "add"
    )


@config_group.command(
    name="role_bypass_add",
    description="Allow a role to bypass role-change security checks"
)
async def config_role_bypass_add(
    interaction: discord.Interaction,
    role: discord.Role
):
    await configure_permission_role(
        interaction,
        "role_bypass_roles",
        role,
        "add"
    )


@config_group.command(
    name="suspended_role",
    description="Set the Discord Suspended role"
)
async def config_suspended_role(
    interaction: discord.Interaction,
    role: discord.Role
):
    if not await config_check(interaction):
        return

    set_config_value(
        interaction.guild.id,
        "discord_suspended_role",
        role.id
    )

    await respond_success(
        interaction,
        f"Discord Suspended role set to {role.mention}."
    )


async def configure_channel(
    interaction,
    key,
    channel
):
    if not await config_check(interaction):
        return

    if not isinstance(channel, discord.TextChannel):
        return await respond_error(
            interaction,
            "Please select a text channel."
        )

    set_config_value(
        interaction.guild.id,
        key,
        channel.id
    )

    await respond_success(
        interaction,
        f"Configured {channel.mention}."
    )


@config_group.command(
    name="security_log",
    description="Set the security log channel"
)
async def config_security_log(
    interaction: discord.Interaction,
    channel: discord.TextChannel
):
    await configure_channel(
        interaction,
        "security_log_channel",
        channel
    )


@config_group.command(
    name="promotion_log",
    description="Set the promotion log channel"
)
async def config_promotion_log(
    interaction: discord.Interaction,
    channel: discord.TextChannel
):
    await configure_channel(
        interaction,
        "promotion_log_channel",
        channel
    )


@config_group.command(
    name="infraction_log",
    description="Set the infraction log channel"
)
async def config_infraction_log(
    interaction: discord.Interaction,
    channel: discord.TextChannel
):
    await configure_channel(
        interaction,
        "infraction_log_channel",
        channel
    )


@config_group.command(
    name="partnership_review",
    description="Set the partnership review channel"
)
async def config_partnership_review(
    interaction: discord.Interaction,
    channel: discord.TextChannel
):
    await configure_channel(
        interaction,
        "partnership_review_channel",
        channel
    )


@config_group.command(
    name="partnership_announcement",
    description="Set the partnership announcement channel"
)
async def config_partnership_announcement(
    interaction: discord.Interaction,
    channel: discord.TextChannel
):
    await configure_channel(
        interaction,
        "partnership_announcement_channel",
        channel
    )


@config_group.command(
    name="appeal_log",
    description="Set the appeal approval channel"
)
async def config_appeal_log(
    interaction: discord.Interaction,
    channel: discord.TextChannel
):
    await configure_channel(
        interaction,
        "appeal_approval_channel",
        channel
    )


@config_group.command(
    name="weekly_quota_role",
    description="Set the role counted for weekly quota"
)
async def config_weekly_quota_role(
    interaction: discord.Interaction,
    role: discord.Role
):
    if not await config_check(interaction):
        return

    set_config_value(
        interaction.guild.id,
        "weekly_quota_role",
        role.id
    )

    await respond_success(
        interaction,
        f"Weekly quota role set to {role.mention}."
    )


@config_group.command(
    name="punishment_role",
    description="Configure a punishment role"
)
@app_commands.choices(
    punishment=[
        app_commands.Choice(name="Strike 1", value="Strike 1"),
        app_commands.Choice(name="Strike 2", value="Strike 2"),
        app_commands.Choice(name="Strike 3", value="Strike 3"),
        app_commands.Choice(name="Suspension", value="Suspension"),
        app_commands.Choice(name="Termination", value="Termination")
    ]
)
async def config_punishment_role(
    interaction: discord.Interaction,
    punishment: app_commands.Choice[str],
    role: discord.Role
):
    if not await config_check(interaction):
        return

    config = get_config(interaction.guild.id)
    punishment_roles = config.get("punishment_roles", {})
    punishment_roles[punishment.value] = role.id

    set_config_value(
        interaction.guild.id,
        "punishment_roles",
        punishment_roles
    )

    await respond_success(
        interaction,
        f"{punishment.value} role set to {role.mention}."
    )


# Legacy config subcommands intentionally not registered; /config opens the dashboard.
# ==================================================
# APPEAL SYSTEM
# ==================================================

class AppealModal(discord.ui.Modal, title="Submit an Appeal"):
    case_id = discord.ui.TextInput(
        label="Case ID",
        placeholder="Enter the case ID",
        max_length=30
    )

    explanation = discord.ui.TextInput(
        label="Why should this case be reviewed?",
        style=discord.TextStyle.paragraph,
        placeholder="Explain why you are appealing this case...",
        max_length=1500
    )

    async def on_submit(self, interaction: discord.Interaction):
        cases = load_cases()

        case = next(
            (
                item for item in cases
                if str(item.get("case_id")) == str(self.case_id.value)
                and str(item.get("guild_id")) == str(interaction.guild.id)
                and str(item.get("member_id")) == str(interaction.user.id)
            ),
            None
        )

        if case is None:
            return await respond_error(
                interaction,
                "I couldn't find a case belonging to you with that ID."
            )

        if case.get("voided"):
            return await respond_error(
                interaction,
                "That case has already been voided."
            )

        appeal_id = f"A{int(datetime.now(timezone.utc).timestamp())}"

        case["appeal"] = {
            "appeal_id": appeal_id,
            "explanation": self.explanation.value,
            "submitted_by": interaction.user.id,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "status": "Pending"
        }

        save_cases(cases)

        review_channel = get_configured_channel(
            interaction.guild,
            "appeal_approval_channel"
        )

        if review_channel is None:
            return await respond_error(
                interaction,
                "The appeal review channel has not been configured."
            )

        embed = make_embed(
            "New Case Appeal",
            (
                f"**Appeal ID:** `{appeal_id}`\n"
                f"**Case ID:** `{self.case_id.value}`\n"
                f"**Member:** {interaction.user.mention}\n"
                f"**Original reason:** {case.get('reason', 'None')}\n\n"
                f"**Appeal explanation:**\n{self.explanation.value}"
            ),
            discord.Color.orange()
        )

        try:
            await review_channel.send(
                embed=embed,
                view=AppealReviewView()
            )
        except discord.HTTPException:
            return await respond_error(
                interaction,
                "I couldn't send the appeal to the review channel."
            )

        await interaction.response.send_message(
            f"Your appeal `{appeal_id}` has been submitted for review.",
            ephemeral=True
        )


class AppealReviewView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Accept Appeal",
        style=discord.ButtonStyle.success,
        custom_id="sentinel_appeal_accept"
    )
    async def accept_appeal(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        if not can_review_appeals(interaction.user, interaction.guild):
            return await respond_error(
                interaction,
                "You do not have permission to review appeals."
            )

        message = interaction.message

        if not message.embeds:
            return await respond_error(
                interaction,
                "Appeal information could not be read."
            )

        description = message.embeds[0].description or ""
        appeal_id = None
        case_id = None

        for line in description.splitlines():
            if line.startswith("**Appeal ID:**"):
                appeal_id = line.split("`")[1]
            elif line.startswith("**Case ID:**"):
                case_id = line.split("`")[1]

        if not case_id:
            return await respond_error(
                interaction,
                "The case ID could not be found."
            )

        cases = load_cases()

        case = next(
            (
                item for item in cases
                if str(item.get("case_id")) == str(case_id)
                and str(item.get("guild_id")) == str(interaction.guild.id)
            ),
            None
        )

        if case is None:
            return await respond_error(
                interaction,
                "That case could not be found."
            )

        appeal = case.get("appeal", {})

        if appeal.get("status") != "Pending":
            return await respond_error(
                interaction,
                "This appeal has already been reviewed."
            )

        appeal["status"] = "Accepted"
        appeal["reviewed_by"] = interaction.user.id
        appeal["reviewed_at"] = datetime.now(timezone.utc).isoformat()

        case["voided"] = True
        case["voided_at"] = datetime.now(timezone.utc).isoformat()
        case["voided_by"] = interaction.user.id
        case["void_reason"] = "Appeal accepted"

        save_cases(cases)

        member = interaction.guild.get_member(
            int(case.get("member_id", 0))
        )

        # Restore saved roles for a suspension appeal.
        if member and case.get("roles_to_restore"):
            suspension_role_id = get_configured_punishment_role(
                interaction.guild,
                "Suspension"
            )

            if suspension_role_id:
                suspension_role = interaction.guild.get_role(
                    int(suspension_role_id)
                )

                if suspension_role and suspension_role in member.roles:
                    try:
                        await member.remove_roles(
                            suspension_role,
                            reason="Sentinel appeal accepted"
                        )
                    except discord.HTTPException:
                        pass

            restore_roles = []

            for role_id in case.get("roles_to_restore", []):
                role = interaction.guild.get_role(int(role_id))

                if role and bot_can_manage_role(interaction.guild, role):
                    restore_roles.append(role)

            await safe_add_roles(
                member,
                restore_roles,
                reason="Sentinel appeal accepted"
            )

        for child in self.children:
            child.disabled = True

        updated_embed = discord.Embed(
            title="Appeal Accepted",
            description=(
                f"Appeal `{appeal_id or 'Unknown'}` for case `{case_id}` "
                f"was accepted by {interaction.user.mention}."
            ),
            color=discord.Color.green(),
            timestamp=datetime.now(timezone.utc)
        )

        await interaction.response.edit_message(
            embed=updated_embed,
            view=self
        )

    @discord.ui.button(
        label="Deny Appeal",
        style=discord.ButtonStyle.danger,
        custom_id="sentinel_appeal_deny"
    )
    async def deny_appeal(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        if not can_review_appeals(interaction.user, interaction.guild):
            return await respond_error(
                interaction,
                "You do not have permission to review appeals."
            )

        if not interaction.message.embeds:
            return await respond_error(
                interaction,
                "Appeal information could not be read."
            )

        description = interaction.message.embeds[0].description or ""
        case_id = None

        for line in description.splitlines():
            if line.startswith("**Case ID:**"):
                case_id = line.split("`")[1]

        if not case_id:
            return await respond_error(
                interaction,
                "The case ID could not be found."
            )

        cases = load_cases()

        case = next(
            (
                item for item in cases
                if str(item.get("case_id")) == str(case_id)
                and str(item.get("guild_id")) == str(interaction.guild.id)
            ),
            None
        )

        if case is None:
            return await respond_error(
                interaction,
                "That case could not be found."
            )

        appeal = case.get("appeal", {})

        if appeal.get("status") != "Pending":
            return await respond_error(
                interaction,
                "This appeal has already been reviewed."
            )

        appeal["status"] = "Denied"
        appeal["reviewed_by"] = interaction.user.id
        appeal["reviewed_at"] = datetime.now(timezone.utc).isoformat()

        save_cases(cases)

        for child in self.children:
            child.disabled = True

        updated_embed = make_embed(
            "Appeal Denied",
            f"Appeal for case `{case_id}` was denied by {interaction.user.mention}.",
            discord.Color.red()
        )

        await interaction.response.edit_message(
            embed=updated_embed,
            view=self
        )


@bot.tree.command(
    name="appeal",
    description="Submit an appeal for one of your cases"
)
async def appeal_command(interaction: discord.Interaction):
    await interaction.response.send_modal(AppealModal())
# ==================================================
# PARTNERSHIP APPLICATION SYSTEM
# ==================================================

class PartnershipModal(discord.ui.Modal, title="Partnership Application"):
    server_name = discord.ui.TextInput(
        label="Server Name",
        placeholder="Enter your server name",
        max_length=100
    )

    invite_link = discord.ui.TextInput(
        label="Server Invite Link",
        placeholder="https://discord.gg/example",
        max_length=200
    )

    member_count = discord.ui.TextInput(
        label="Member Count",
        placeholder="How many members does your server have?",
        max_length=20
    )

    description = discord.ui.TextInput(
        label="Server Description",
        style=discord.TextStyle.paragraph,
        placeholder="Describe your server...",
        max_length=1000
    )

    async def on_submit(self, interaction: discord.Interaction):
        review_channel = get_configured_channel(
            interaction.guild,
            "partnership_review_channel"
        )

        if review_channel is None:
            return await respond_error(
                interaction,
                "The partnership review channel has not been configured."
            )

        if not self.invite_link.value.startswith(
            ("https://discord.gg/", "https://discord.com/invite/")
        ):
            return await respond_error(
                interaction,
                "Please enter a valid Discord invite link."
            )

        embed = make_embed(
            "New Partnership Request",
            (
                f"**Applicant:** {interaction.user.mention}\n"
                f"**Server:** {self.server_name.value}\n"
                f"**Invite:** {self.invite_link.value}\n"
                f"**Member Count:** {self.member_count.value}\n\n"
                f"**Description:**\n{self.description.value}"
            ),
            discord.Color.blurple()
        )

        try:
            await review_channel.send(
                embed=embed,
                view=PartnershipReviewView()
            )
        except discord.HTTPException:
            return await respond_error(
                interaction,
                "I couldn't submit the partnership request."
            )

        await interaction.response.send_message(
            "Your partnership request has been submitted.",
            ephemeral=True
        )


class PartnershipReviewView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Approve",
        style=discord.ButtonStyle.success,
        custom_id="sentinel_partnership_approve"
    )
    async def approve(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        if not can_approve_partnerships(
            interaction.user,
            interaction.guild
        ):
            return await respond_error(
                interaction,
                "You do not have permission to approve partnerships."
            )

        if not interaction.message.embeds:
            return await respond_error(
                interaction,
                "Partnership information could not be read."
            )

        original = interaction.message.embeds[0]
        description = original.description or ""

        if description.startswith("**Status:**"):
            return await respond_error(
                interaction,
                "This request has already been reviewed."
            )

        announcement_channel = get_configured_channel(
            interaction.guild,
            "partnership_announcement_channel"
        )

        if announcement_channel is None:
            return await respond_error(
                interaction,
                "The partnership announcement channel is not configured."
            )

        announcement = make_embed(
            "New Server Partnership",
            description,
            discord.Color.green()
        )

        try:
            await announcement_channel.send(embed=announcement)
        except discord.HTTPException:
            return await respond_error(
                interaction,
                "I couldn't post the partnership announcement."
            )

        approved_embed = make_embed(
            "Partnership Approved",
            f"{description}\n\n**Status:** Approved by {interaction.user.mention}",
            discord.Color.green()
        )

        for child in self.children:
            child.disabled = True

        await interaction.response.edit_message(
            embed=approved_embed,
            view=self
        )

    @discord.ui.button(
        label="Deny",
        style=discord.ButtonStyle.danger,
        custom_id="sentinel_partnership_deny"
    )
    async def deny(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        if not can_approve_partnerships(
            interaction.user,
            interaction.guild
        ):
            return await respond_error(
                interaction,
                "You do not have permission to deny partnerships."
            )

        if not interaction.message.embeds:
            return await respond_error(
                interaction,
                "Partnership information could not be read."
            )

        original = interaction.message.embeds[0]
        description = original.description or ""

        if "**Status:**" in description:
            return await respond_error(
                interaction,
                "This request has already been reviewed."
            )

        denied_embed = make_embed(
            "Partnership Denied",
            f"{description}\n\n**Status:** Denied by {interaction.user.mention}",
            discord.Color.red()
        )

        for child in self.children:
            child.disabled = True

        await interaction.response.edit_message(
            embed=denied_embed,
            view=self
        )


@bot.tree.command(
    name="partnership",
    description="Submit a partnership application"
)
async def partnership_command(interaction: discord.Interaction):
    await interaction.response.send_modal(PartnershipModal())
# ==================================================
# DISCORD SECURITY COMMANDS
# ==================================================

discord_group = app_commands.Group(
    name="discord",
    description="Discord server security management"
)


async def apply_security_suspension(
    member,
    actor,
    reason
):
    guild = member.guild

    config = get_config(guild.id)
    suspended_role_id = config.get("discord_suspended_role")

    if not suspended_role_id:
        return False, "The Discord Suspended role has not been configured."

    suspended_role = guild.get_role(int(suspended_role_id))

    if suspended_role is None:
        return False, "The configured Discord Suspended role no longer exists."

    if not bot_can_manage_role(guild, suspended_role):
        return False, "I cannot manage the Discord Suspended role."

    original_roles = [
        role.id for role in member.roles
        if not role.is_default()
        and role.id != suspended_role.id
    ]

    # Save the roles before changing them, so they can be restored later.
    save_security_suspension(
        guild.id,
        member.id,
        original_roles,
        reason,
        actor.id
    )

    removable_roles = [
        role for role in member.roles
        if not role.is_default()
        and role != suspended_role
        and bot_can_manage_role(guild, role)
    ]

    try:
        if removable_roles:
            await member.remove_roles(
                *removable_roles,
                reason=f"Sentinel security suspension: {reason}"
            )

        if suspended_role not in member.roles:
            await member.add_roles(
                suspended_role,
                reason=f"Sentinel security suspension: {reason}"
            )

    except discord.HTTPException:
        return False, "Discord rejected the role update. Check the bot's role hierarchy."

    return True, "Member suspended successfully."


async def restore_security_suspension(member, actor):
    guild = member.guild
    suspensions = load_security_suspensions()

    guild_data = suspensions.get(str(guild.id), {})
    record = guild_data.get(str(member.id))

    if not record:
        return False, "No saved suspension record was found."

    config = get_config(guild.id)
    suspended_role_id = config.get("discord_suspended_role")

    if suspended_role_id:
        suspended_role = guild.get_role(int(suspended_role_id))

        if suspended_role and suspended_role in member.roles:
            try:
                await member.remove_roles(
                    suspended_role,
                    reason=f"Sentinel unsuspension by {actor}"
                )
            except discord.HTTPException:
                return False, "I couldn't remove the Discord Suspended role."

    restored = []
    skipped = []

    for role_id in record.get("roles", []):
        role = guild.get_role(int(role_id))

        if role is None:
            skipped.append(f"Role `{role_id}` no longer exists.")
            continue

        if role in member.roles:
            continue

        if not bot_can_manage_role(guild, role):
            skipped.append(f"Cannot manage {role.name}.")
            continue

        try:
            await member.add_roles(
                role,
                reason=f"Sentinel unsuspension by {actor}"
            )
            restored.append(role)
        except discord.HTTPException:
            skipped.append(f"Could not restore {role.name}.")

    # Keep the record if any roles still need restoration.
    if skipped:
        record["pending_roles"] = [
            role_id for role_id in record.get("roles", [])
            if (
                guild.get_role(int(role_id)) is None
                or guild.get_role(int(role_id)) not in member.roles
            )
        ]
        record["last_restore_attempt"] = datetime.now(
            timezone.utc
        ).isoformat()
        save_security_suspensions(suspensions)

        return True, (
            f"Restored {len(restored)} role(s). "
            f"Some roles still need attention: {' '.join(skipped)}"
        )

    guild_data.pop(str(member.id), None)

    if not guild_data:
        suspensions.pop(str(guild.id), None)
    else:
        suspensions[str(guild.id)] = guild_data

    save_security_suspensions(suspensions)

    return True, f"Successfully restored {len(restored)} role(s)."


@discord_group.command(
    name="suspend",
    description="Apply the Discord Suspended role to a member"
)
@app_commands.describe(
    member="Member to suspend",
    reason="Reason for the suspension"
)
async def discord_suspend(
    interaction: discord.Interaction,
    member: discord.Member,
    reason: str
):
    if not can_manage_discord_security(
        interaction.user,
        interaction.guild
    ):
        return await respond_error(
            interaction,
            "You do not have permission to use Discord security commands."
        )

    if member.id == interaction.user.id:
        return await respond_error(
            interaction,
            "You cannot suspend yourself."
        )

    await interaction.response.defer(ephemeral=True)

    success, message = await apply_security_suspension(
        member,
        interaction.user,
        reason
    )

    if not success:
        return await interaction.followup.send(
            message,
            ephemeral=True
        )

    embed = make_embed(
        "Discord Security Suspension",
        (
            f"**Member:** {member.mention}\n"
            f"**Issued by:** {interaction.user.mention}\n"
            f"**Reason:** {reason}"
        ),
        discord.Color.red()
    )

    await send_log(
        interaction.guild,
        "security_log_channel",
        embed
    )

    await interaction.followup.send(
        message,
        ephemeral=True
    )


@discord_group.command(
    name="unsuspend",
    description="Restore a member's saved roles"
)
@app_commands.describe(
    member="Member to unsuspend"
)
async def discord_unsuspend(
    interaction: discord.Interaction,
    member: discord.Member
):
    if not can_manage_discord_security(
        interaction.user,
        interaction.guild
    ):
        return await respond_error(
            interaction,
            "You do not have permission to use Discord security commands."
        )

    await interaction.response.defer(ephemeral=True)

    success, message = await restore_security_suspension(
        member,
        interaction.user
    )

    if not success:
        return await interaction.followup.send(
            message,
            ephemeral=True
        )

    embed = make_embed(
        "Discord Security Unsuspension",
        (
            f"**Member:** {member.mention}\n"
            f"**Restored by:** {interaction.user.mention}\n"
            f"**Result:** {message}"
        ),
        discord.Color.green()
    )

    await send_log(
        interaction.guild,
        "security_log_channel",
        embed
    )

    await interaction.followup.send(
        message,
        ephemeral=True
    )


bot.tree.add_command(discord_group)


# ==================================================
# SECURITY LOG HELPER
# ==================================================

async def security_log(guild, title, description, color=None):
    embed = make_embed(
        title,
        description,
        color or discord.Color.orange()
    )

    await send_log(
        guild,
        "security_log_channel",
        embed
    )


# ==================================================
# BOT ADD SECURITY MONITOR
# ==================================================

@bot.event
async def on_member_join(member):
    if not member.bot:
        return

    await asyncio.sleep(2)

    try:
        async for entry in member.guild.audit_logs(
            limit=5,
            action=discord.AuditLogAction.bot_add
        ):
            if entry.target and entry.target.id == member.id:
                actor = entry.user

                if actor is None:
                    break

                await security_log(
                    member.guild,
                    "Bot Added",
                    (
                        f"**Bot:** {member.mention}\n"
                        f"**Added by:** {actor.mention}\n"
                        f"**Bot ID:** `{member.id}`"
                    )
                )

                if not can_add_bots(actor, member.guild):
                    success, result = await apply_security_suspension(
                        actor,
                        bot.user,
                        "Unauthorized bot addition"
                    )

                    await security_log(
                        member.guild,
                        "Unauthorized Bot Addition",
                        (
                            f"**Actor:** {actor.mention}\n"
                            f"**Added bot:** {member.mention}\n"
                            f"**Security action:** {result}"
                        ),
                        discord.Color.red()
                    )

                return

    except discord.Forbidden:
        await security_log(
            member.guild,
            "Security Audit Unavailable",
            "I do not have permission to view the server audit log."
        )


# ==================================================
# MEMBER ROLE CHANGE SECURITY MONITOR
# ==================================================

@bot.event
async def on_member_update(before, after):
    before_roles = {
        role.id for role in before.roles
        if not role.is_default()
    }

    after_roles = {
        role.id for role in after.roles
        if not role.is_default()
    }

    added_ids = after_roles - before_roles
    removed_ids = before_roles - after_roles

    if not added_ids and not removed_ids:
        return

    actor = None

    try:
        async for entry in after.guild.audit_logs(
            limit=10,
            action=discord.AuditLogAction.member_role_update
        ):
            if (
                entry.target
                and entry.target.id == after.id
                and (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 15
            ):
                actor = entry.user
                break

    except discord.Forbidden:
        pass

    added_roles = [
        after.guild.get_role(role_id)
        for role_id in added_ids
    ]

    removed_roles = [
        after.guild.get_role(role_id)
        for role_id in removed_ids
    ]

    added_text = ", ".join(
        role.mention for role in added_roles if role
    ) or "None"

    removed_text = ", ".join(
        role.mention for role in removed_roles if role
    ) or "None"

    await security_log(
        after.guild,
        "Member Roles Updated",
        (
            f"**Member:** {after.mention}\n"
            f"**Changed by:** {actor.mention if actor else 'Unknown'}\n"
            f"**Added:** {added_text}\n"
            f"**Removed:** {removed_text}"
        )
    )

    # Only act when the audit log clearly identifies the actor.
    if actor is None or actor.bot or can_manage_discord_security(
        actor,
        after.guild
    ):
        return

    # Check whether a newly added role is outside the configured
    # role-bypass list. Do not punish when attribution is uncertain.
    config = get_config(after.guild.id)
    bypass_ids = {
        int(role_id)
        for role_id in config.get("role_bypass_roles", [])
    }

    if any(
        role_id not in bypass_ids
        for role_id in added_ids
    ):
        await security_log(
            after.guild,
            "Unapproved Role Change Detected",
            (
                f"**Member:** {after.mention}\n"
                f"**Actor:** {actor.mention}\n"
                f"**Added roles:** {added_text}\n"
                f"**Removed roles:** {removed_text}\n"
                "No automatic suspension was applied. Review the audit log."
            ),
            discord.Color.red()
        )


# ==================================================
# MEMBER LEAVE SECURITY LOG
# ==================================================

@bot.event
async def on_member_remove(member):
    await asyncio.sleep(1)

    action = "Member Left"
    actor_text = "Unknown"

    try:
        async for entry in member.guild.audit_logs(
            limit=5,
            action=discord.AuditLogAction.kick
        ):
            if (
                entry.target
                and entry.target.id == member.id
                and (datetime.now(timezone.utc) - entry.created_at).total_seconds() < 15
            ):
                action = "Member Kicked"
                actor_text = entry.user.mention if entry.user else "Unknown"
                break

    except discord.Forbidden:
        pass

    await security_log(
        member.guild,
        action,
        (
            f"**Member:** {member} (`{member.id}`)\n"
            f"**Actor:** {actor_text}"
        )
    )


# ==================================================
# MEMBER BAN SECURITY LOG
# ==================================================

@bot.event
async def on_member_ban(guild, user):
    await security_log(
        guild,
        "Member Banned",
        f"**Member:** {user} (`{user.id}`)",
        discord.Color.red()
    )
# ==================================================
# SECURITY SUSPENSION STORAGE
# ==================================================

def load_security_suspensions():
    return read_json(SECURITY_FILE, {})


def save_security_suspensions(data):
    write_json(SECURITY_FILE, data)


def save_security_suspension(
    guild_id,
    member_id,
    role_ids,
    reason,
    actor_id
):
    data = load_security_suspensions()

    guild_key = str(guild_id)
    member_key = str(member_id)

    if guild_key not in data:
        data[guild_key] = {}

    data[guild_key][member_key] = {
        "roles": [int(role_id) for role_id in role_ids],
        "reason": reason,
        "actor_id": int(actor_id),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    save_security_suspensions(data)


# ==================================================
# INTERACTIVE EMBED EDITOR
# ==================================================

class EmbedEditorModal(discord.ui.Modal, title="Edit Embed Message"):
    title_input = discord.ui.TextInput(
        label="Title", max_length=256, required=False, placeholder="Embed title"
    )
    description_input = discord.ui.TextInput(
        label="Description", style=discord.TextStyle.paragraph,
        max_length=4000, required=False, placeholder="Embed description"
    )
    footer_input = discord.ui.TextInput(
        label="Footer", max_length=2048, required=False, placeholder="Embed footer"
    )
    color_input = discord.ui.TextInput(
        label="Color (hex)", max_length=7, required=False,
        default="#5865F2", placeholder="#FF0000"
    )

    def __init__(self, editor):
        super().__init__()
        self.editor = editor
        self.title_input.default = editor.embed.title or ""
        self.description_input.default = editor.embed.description or ""
        self.footer_input.default = editor.embed.footer.text or ""
        self.color_input.default = f"#{editor.embed.color.value:06X}" if editor.embed.color else "#5865F2"

    async def on_submit(self, interaction: discord.Interaction):
        try:
            raw_color = self.color_input.value.strip().lstrip("#") or "5865F2"
            if len(raw_color) != 6:
                raise ValueError
            color = discord.Color(int(raw_color, 16))
        except ValueError:
            return await interaction.response.send_message(
                "Enter a valid six-digit hex color, such as `#FF0000`.", ephemeral=True
            )

        self.editor.embed = discord.Embed(
            title=self.title_input.value.strip() or None,
            description=self.description_input.value.strip() or None,
            color=color
        )
        if self.footer_input.value.strip():
            self.editor.embed.set_footer(text=self.footer_input.value.strip())
        await interaction.response.edit_message(
            content="Embed updated. Use **Preview** to review it, **Send** to post it, or **Cancel** to close.",
            embed=self.editor.embed,
            view=self.editor
        )


class EmbedEditorView(discord.ui.View):
    def __init__(self, author_id: int, channel: discord.abc.Messageable):
        super().__init__(timeout=300)
        self.author_id = author_id
        self.channel = channel
        self.embed = discord.Embed(
            title="New Embed",
            description="Edit this message to get started.",
            color=discord.Color.blurple()
        )
        self.finished = False

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author_id:
            await interaction.response.send_message(
                "Only the person who opened this editor can use it.", ephemeral=True
            )
            return False
        return True

    @discord.ui.button(label="Edit Message", style=discord.ButtonStyle.primary)
    async def edit_embed(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(EmbedEditorModal(self))

    @discord.ui.button(label="Preview", style=discord.ButtonStyle.secondary)
    async def preview_embed(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(
            content="**Live preview** — make changes with Edit Message, then Send when ready.",
            embed=self.embed,
            view=self
        )

    @discord.ui.button(label="Send", style=discord.ButtonStyle.success)
    async def send_embed(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            await self.channel.send(embed=self.embed)
        except discord.HTTPException:
            return await interaction.response.send_message(
                "I couldn't send the embed. Check my channel permissions and try again.", ephemeral=True
            )
        self.finished = True
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(
            content="Embed sent successfully.", embed=self.embed, view=self
        )
        self.stop()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.danger)
    async def cancel_embed(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.finished = True
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(
            content="Embed editor cancelled. Nothing was sent.", embed=None, view=self
        )
        self.stop()


@bot.tree.command(name="embed", description="Create and send a custom embed")
@app_commands.checks.has_permissions(manage_messages=True)
async def embed_editor_command(interaction: discord.Interaction):
    view = EmbedEditorView(interaction.user.id, interaction.channel)
    await interaction.response.send_message(
        "Use **Edit Message** to set the title, description, footer, and color. Preview before sending.",
        embed=view.embed,
        view=view,
        ephemeral=True
    )


# ==================================================
# VERSION COMMAND
# ==================================================

@bot.tree.command(
    name="version",
    description="View Sentinel's version information"
)
async def version_command(interaction: discord.Interaction):
    embed = make_embed(
        "Sentinel",
        (
            f"**Version:** `{VERSION}`\n"
            f"**Library:** `discord.py`\n"
            f"**Status:** Online\n"
            f"**Server:** {interaction.guild.name}"
        ),
        discord.Color.blurple()
    )

    await interaction.response.send_message(
        embed=embed,
        ephemeral=True
    )


# ==================================================
# GLOBAL COMMAND ERROR HANDLER
# ==================================================

@bot.tree.error
async def on_app_command_error(
    interaction: discord.Interaction,
    error: app_commands.AppCommandError
):
    original_error = getattr(error, "original", error)

    print(
        f"Slash command error in {interaction.guild}: "
        f"{type(original_error).__name__}: {original_error}"
    )

    if isinstance(error, app_commands.MissingPermissions):
        message = "You do not have the Discord permissions required for this command."

    elif isinstance(error, app_commands.CommandOnCooldown):
        message = "This command is on cooldown. Please try again shortly."

    elif isinstance(error, app_commands.CheckFailure):
        message = "You do not have permission to use this command."

    else:
        message = (
            "Something went wrong while running that command. "
            "The error has been printed in the bot console."
        )

    try:
        await respond_error(interaction, message)
    except discord.HTTPException:
        pass
# YOUR OTHER SENTINEL CODE ABOVE

# ==================================================
# BOT RUN
# ==================================================

if not TOKEN:
    raise RuntimeError(
        "DISCORD_TOKEN is missing. Check your .env file."
    )

print(f"Starting Sentinel {VERSION}...")
bot.run(TOKEN)
