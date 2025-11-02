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

import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
const app = express();
app.get("/", (_, res) => res.send("BOT running ✅"));
app.listen(8080);

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const TOKEN = process.env.TOKEN;
const GUILD_ID = "1200037290047701042";
const PANEL_CHANNEL_ID = "1434217100636979310";        // AFK PANEL
const LOG_CHANNEL_ID = "1434217235546771467";           // AFK LOGS
const ECONOMY_PANEL_CHANNEL = "1434221655923757126";    // ECONOMY PANEL

const RATE = 0.5; // coin per minute

// ------------------------------------------------------------
// STORAGE (JSON для экономики)
// ------------------------------------------------------------
let users = JSON.parse(fs.readFileSync("./users.json", "utf8"));
function saveUsers() { fs.writeFileSync("./users.json", JSON.stringify(users, null, 2)); }

// ------------------------------------------------------------
// DISCORD CLIENT
// ------------------------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message]
});

// ------------------------------------------------------------
// REGISTER SLASH COMMANDS
// ------------------------------------------------------------
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
        body: [
            new SlashCommandBuilder().setName("afkpanel").setDescription("Создать панель AFK").toJSON(),
            new SlashCommandBuilder().setName("econpanel").setDescription("Создать панель экономики").toJSON()
        ]
    });
}

// ------------------------------------------------------------
// AFK SYSTEM
// ------------------------------------------------------------
const afk = new Map();

function formatTime(date) {
    return date.toLocaleTimeString("ru-RU", {
        timeZone: "Europe/Moscow",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function timeLeft(until) {
    const ms = until - new Date();
    return `${Math.floor(ms / 1000 / 60 / 60)}ч ${Math.floor(ms / 1000 / 60) % 60}м`;
}

async function updateAFKPanel(guild) {
    const channel = guild.channels.cache.get(PANEL_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle("⏳ Люди в AFK")
        .setColor("#2b2d31")
        .setFooter({ text: "Garcia famq Majestic" });

    if (afk.size === 0) {
        embed.setDescription("Сейчас никто не в AFK ✅");
    } else {
        let t = `• Всего AFK: **${afk.size}**\n\n`;
        let i = 1;
        afk.forEach((data, uid) => {
            const user = guild.members.cache.get(uid);
            t += `**${i})** ${user}\nПричина: \`${data.reason}\`\nВернусь: \`${formatTime(data.untilDate)}\` (${timeLeft(data.untilDate)})\n\n`;
            i++;
        });
        embed.setDescription(t);
    }

    const file = new AttachmentBuilder("banner.png");
    embed.setImage("attachment://banner.png");

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("afk_on").setStyle(ButtonStyle.Secondary).setEmoji("😴").setLabel("AFK"),
        new ButtonBuilder().setCustomId("afk_off").setStyle(ButtonStyle.Success).setEmoji("✅").setLabel("Вернуться")
    );

    if (client.afkMessage) client.afkMessage.edit({ embeds: [embed], files: [file], components: [row] });
    else client.afkMessage = await channel.send({ embeds: [embed], files: [file], components: [row] });
}

// Автоснятие AFK
setInterval(() => {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    let changed = false;
    afk.forEach((d, uid) => {
        if (d.untilDate <= new Date()) {
            afk.delete(uid);
            changed = true;
        }
    });
    if (changed) updateAFKPanel(guild);
}, 10000);

setInterval(() => {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) updateAFKPanel(guild);
}, 60000);

// ------------------------------------------------------------
// ECONOMY SYSTEM
// ------------------------------------------------------------

// начисление coin каждую минуту
setInterval(() => {
    client.guilds.cache.forEach(guild => {
        guild.members.cache.forEach(member => {
            if (!member.voice.channel || member.user.bot) return;

            if (!users[member.id]) users[member.id] = { coins: 0, minutes: 0 };

            users[member.id].coins += RATE;
            users[member.id].minutes++;
        });
    });

    saveUsers();
    updateEconomyPanel();
}, 60000);

// Экономика панель
async function updateEconomyPanel() {
    const guild = client.guilds.cache.get(GUILD_ID);
    const channel = guild.channels.cache.get(ECONOMY_PANEL_CHANNEL);

    const embed = new EmbedBuilder()
        .setTitle("💰 Voice Economy (coin)")
        .setColor("#e8b923")
        .setDescription("🎧 За активность в войсах начисляется **0.5 coin / 1 минуту**")
        .setFooter({ text: "Garcia famq Majestic" });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("eco_top").setStyle(ButtonStyle.Secondary).setEmoji("📊").setLabel("Топ"),
        new ButtonBuilder().setCustomId("eco_balance").setStyle(ButtonStyle.Success).setEmoji("💰").setLabel("Баланс"),
        new ButtonBuilder().setCustomId("eco_shop").setStyle(ButtonStyle.Primary).setEmoji("🛒").setLabel("Магазин")
    );

    if (client.ecoMessage) client.ecoMessage.edit({ embeds: [embed], components: [row] });
    else client.ecoMessage = await channel.send({ embeds: [embed], components: [row] });
}

// ------------------------------------------------------------
// BUTTON HANDLERS
// ------------------------------------------------------------
client.on("interactionCreate", async (i) => {
    // AFK PANEL
    if (i.isChatInputCommand() && i.commandName === "afkpanel") {
        client.afkMessage = null;
        await updateAFKPanel(i.guild);
        return i.reply({ content: "✅ Панель AFK создана", ephemeral: true });
    }

    if (i.customId === "afk_on") {
        const modal = new ModalBuilder().setCustomId("afk_modal").setTitle("Уход в AFK");
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Причина").setStyle(TextInputStyle.Paragraph)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("hours").setLabel("Время (1–8 часов)").setStyle(TextInputStyle.Short))
        );
        return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "afk_modal") {
        const reason = i.fields.getTextInputValue("reason");
        const hours = Math.max(1, Math.min(8, parseInt(i.fields.getTextInputValue("hours"))));
        const until = new Date(Date.now() + hours * 60 * 60 * 1000);

        afk.set(i.user.id, { reason, untilDate: until });
        await updateAFKPanel(i.guild);
        return i.reply({ content: "✅ Ты ушёл в AFK!", ephemeral: true });
    }

    if (i.customId === "afk_off") {
        afk.delete(i.user.id);
        await updateAFKPanel(i.guild);
        return i.reply({ content: "👋 Добро пожаловать обратно!", ephemeral: true });
    }

    // ECONOMIC BUTTONS
    if (i.isChatInputCommand() && i.commandName === "econpanel") {
        client.ecoMessage = null;
        await updateEconomyPanel();
        return i.reply({ content: "✅ Панель экономики создана", ephemeral: true });
    }

    if (i.customId === "eco_balance") {
        const bal = users[i.user.id]?.coins || 0;
        return i.reply({ content: `💰 У тебя **${bal.toFixed(1)} coin**`, ephemeral: true });
    }

    if (i.customId === "eco_top") {
        const sorted = Object.entries(users)
            .sort((a, b) => b[1].coins - a[1].coins)
            .slice(0, 10);

        const embed = new EmbedBuilder()
            .setTitle("📊 Топ по coin")
            .setColor("#e8b923");

        let txt = "";
        sorted.forEach(([uid, data], idx) => {
            txt += `**${idx + 1})** <@${uid}> — **${data.coins.toFixed(1)} coin**\n`;
        });

        embed.setDescription(txt || "Пока пусто...");
        return i.reply({ embeds: [embed], ephemeral: true });
    }

    if (i.customId === "eco_shop") {
        return i.reply({ content: "🛒 Магазин скоро!", ephemeral: true });
    }
});

// ------------------------------------------------------------
client.once("ready", async () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    await registerCommands();
});

client.login(TOKEN);

