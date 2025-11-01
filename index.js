import {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    EmbedBuilder,
    Routes,
    REST
} from "discord.js";

import dotenv from "dotenv";
dotenv.config();

import express from "express";

// ---- keep alive server (Railway / Replit не даст боту уснуть) ----
const app = express();
app.get("/", (_, res) => res.send("AFK bot running 24/7 ✅"));
app.listen(8080);

// ---- CONFIG ----
const TOKEN = process.env.TOKEN;
const GUILD_ID = "1200037290047701042";
const PANEL_CHANNEL_ID = "1300952366954184754";
const LOG_CHANNEL_ID = "1383462345790984283";

const afk = new Map(); // userId → { reason, untilDate }

// ---- CLIENT ----
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ],
    partials: [Partials.Message]
});

// ---- REGISTER SLASH COMMAND ----
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
        body: [
            new SlashCommandBuilder()
                .setName("afkpanel")
                .setDescription("Создать панель AFK")
                .toJSON()
        ]
    });
}

// ---- FORMAT MOSCOW TIME ----
function formatMoscowTime(date) {
    return date.toLocaleTimeString("ru-RU", {
        timeZone: "Europe/Moscow",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

// ---- TIME LEFT CALC ----
function timeLeft(until) {
    const ms = until - new Date();
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms / (1000 * 60)) % 60);
    return `${h}ч ${m}м`;
}

// ---- UPDATE PANEL ----
async function updatePanel(guild) {
    const channel = guild.channels.cache.get(PANEL_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle("⏳ Люди, находящиеся в AFK:")
        .setColor("#2b2d31")
        .setFooter({ text: "Garcia famq Majestic" });

    if (afk.size === 0) {
        embed.setDescription("✅ Сейчас никто не в AFK");
    } else {
        let text = `• Всего в AFK: **${afk.size}** чел.\n\n`;
        let index = 1;

        afk.forEach((data, userId) => {
            const user = guild.members.cache.get(userId);
            text += `**${index})** ${user} — Причина: \`${data.reason}\`\n`;
            text += `Вернусь в: \`${formatMoscowTime(data.untilDate)}\` (${timeLeft(data.untilDate)})\n\n`;
            index++;
        });

        embed.setDescription(text);
    }

    const file = new AttachmentBuilder("banner.png");
    embed.setImage("attachment://banner.png");

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("afk_on")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("😴")
            .setLabel("Отошёл AFK"),

        new ButtonBuilder()
            .setCustomId("afk_off")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
            .setLabel("Вернулся из AFK")
    );

    if (client.afkMessage) {
        await client.afkMessage.edit({
            embeds: [embed],
            files: [file],
            components: [row],
        });
    } else {
        client.afkMessage = await channel.send({
            embeds: [embed],
            files: [file],
            components: [row],
        });
    }
}

// ---- LOGGING ----
async function logAction(guild, user, action, reason = null) {
    const channel = guild.channels.cache.get(LOG_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle(action)
        .setColor("#0077ff")
        .addFields({ name: "Пользователь", value: user.toString(), inline: false });

    if (reason) embed.addFields({ name: "Причина", value: "`" + reason + "`" });

    channel.send({ embeds: [embed] });
}

// ---- AUTO REMOVE AFK ----
setInterval(async () => {
    const now = new Date();
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    let updated = false;

    afk.forEach((data, userId) => {
        if (data.untilDate <= now) {
            const user = guild.members.cache.get(userId);
            afk.delete(userId);
            updated = true;
            logAction(guild, user, "⌛ AFK снят автоматически (время истекло)");
        }
    });

    if (updated) updatePanel(guild);
}, 10000); // каждые 10 секунд проверка

// ---- BUTTON HANDLERS ----
client.on("interactionCreate", async (i) => {
    if (i.isChatInputCommand() && i.commandName === "afkpanel") {
        client.afkMessage = null;
        await updatePanel(i.guild);
        return i.reply({ content: "✅ Панель AFK создана", ephemeral: true });
    }

    if (i.isButton() && i.customId === "afk_on") {
        const modal = new ModalBuilder()
            .setCustomId("afk_modal")
            .setTitle("Уход в AFK");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("reason").setLabel("Причина").setStyle(TextInputStyle.Paragraph)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("hours").setLabel("Время (1-8 часов)").setStyle(TextInputStyle.Short)
            )
        );

        return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "afk_modal") {
        const reason = i.fields.getTextInputValue("reason");
        const hours = Math.max(1, Math.min(8, parseInt(i.fields.getTextInputValue("hours"))));
        const until = new Date(Date.now() + hours * 60 * 60 * 1000);

        afk.set(i.user.id, {
            reason,
            untilDate: until,
        });

        await updatePanel(i.guild);
        await logAction(i.guild, i.user, "😴 Ушёл в AFK", reason);

        return i.reply({ content: "✅ Ты ушёл в AFK!", ephemeral: true });
    }

    if (i.isButton() && i.customId === "afk_off") {
        afk.delete(i.user.id);
        await updatePanel(i.guild);
        await logAction(i.guild, i.user, "✅ Вернулся из AFK");
        return i.reply({ content: "👋 Добро пожаловать обратно!", ephemeral: true });
    }
});

// ---- READY ----
client.once("ready", async () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    await registerCommands();
});

client.login(TOKEN);
