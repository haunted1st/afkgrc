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
    EmbedBuilder,
    AttachmentBuilder,
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
const PANEL_CHANNEL_ID = "1434217100636979310";
const ECONOMY_PANEL_CHANNEL = "1434221655923757126";

const RATE = 0.5;
const FULL_RIGHTS_ROLE = "1434495913992257677";
const FULL_RIGHTS_PRICE = 500;

// ------------------------------------------------------------
// STORAGE
// ------------------------------------------------------------
let users = JSON.parse(fs.readFileSync("./users.json", "utf8"));
function saveUsers() {
    fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));
}

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
// SLASH COMMANDS
// ------------------------------------------------------------
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
        body: [
            new SlashCommandBuilder().setName("afkpanel").setDescription("Создать панель AFK").toJSON(),
            new SlashCommandBuilder().setName("econpanel").setDescription("Создать панель экономики").toJSON(),

            new SlashCommandBuilder()
                .setName("addcoins")
                .setDescription("Выдать монеты пользователю (админ)")
                .addUserOption(o => o.setName("user").setDescription("Кому").setRequired(true))
                .addIntegerOption(o => o.setName("amount").setDescription("Сколько coin?").setRequired(true))
                .toJSON(),

            new SlashCommandBuilder()
                .setName("removecoins")
                .setDescription("Забрать монеты у пользователя (админ)")
                .addUserOption(o => o.setName("user").setDescription("У кого").setRequired(true))
                .addIntegerOption(o => o.setName("amount").setDescription("Сколько coin?").setRequired(true))
                .toJSON(),
        ]
    });
}

// ------------------------------------------------------------
// AFK SYSTEM
// ------------------------------------------------------------
const afk = new Map();

function formatTime(date) {
    return date.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeLeft(until) {
    const ms = until - new Date();
    return `${Math.floor(ms / 60000 / 60)}ч ${Math.floor(ms / 60000) % 60}м`;
}

// Update AFK Panel
async function updateAFKPanel(guild) {
    const channel = guild.channels.cache.get(PANEL_CHANNEL_ID);
    const file = new AttachmentBuilder("banner.png");

    const embed = new EmbedBuilder()
        .setColor("#2b2d31")
        .setImage("attachment://banner.png")
        .setDescription(
`**╔════════════════════╗**
**         ⏳ AFK PANEL**
**╚════════════════════╝**
`
        )
        .setFooter({ text: "Garcia famq Majestic" });

    if (afk.size === 0) {
        embed.addFields({ name: "Список AFK:", value: "✅ Сейчас никто не в AFK" });
    } else {
        let list = "";
        let count = 1;
        afk.forEach((d, uid) => {
            list += `**${count})** <@${uid}> — \`${d.reason}\`\nВернётся: \`${formatTime(d.untilDate)}\` (**${timeLeft(d.untilDate)}**)\n\n`;
            count++;
        });
        embed.addFields({ name: "Список AFK:", value: list });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("afk_on").setStyle(ButtonStyle.Secondary).setEmoji("😴").setLabel("AFK"),
        new ButtonBuilder().setCustomId("afk_off").setStyle(ButtonStyle.Success).setEmoji("✅").setLabel("Вернуться")
    );

    if (client.afkMessage) client.afkMessage.edit({ embeds: [embed], files: [file], components: [row] });
    else client.afkMessage = await channel.send({ embeds: [embed], files: [file], components: [row] });
}

// Auto remove AFK
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
}, 5000);

// Anti fake AFK — switching channels removes AFK
client.on("voiceStateUpdate", (o, n) => {
    if (afk.has(n.member.id) && o.channelId !== n.channelId) {
        afk.delete(n.member.id);
        updateAFKPanel(n.guild);
    }
});

// ------------------------------------------------------------
// ECONOMY SYSTEM
// ------------------------------------------------------------
setInterval(() => {
    client.guilds.cache.forEach(guild => {
        guild.members.cache.forEach(m => {
            if (!m.voice.channel || m.user.bot) return;
            if (!users[m.id]) users[m.id] = { coins: 0, minutes: 0 };
            users[m.id].coins += RATE;
            users[m.id].minutes++;
        });
    });

    saveUsers();
    updateEconomyPanel();
}, 60000);

// Economy Panel (UI)
async function updateEconomyPanel() {
    const guild = client.guilds.cache.get(GUILD_ID);
    const channel = guild.channels.cache.get(ECONOMY_PANEL_CHANNEL);

    const file = new AttachmentBuilder("banner.png");

    const embed = new EmbedBuilder()
        .setColor("#FFD43B")
        .setImage("attachment://banner.png")
        .setDescription(
`**╔════════════════════╗**
**     💰 Магазин GARCIA FAMQ**
**╚════════════════════╝**

🎧 **0.5 coin / минута в войсе**

━━━━━━━━━━━━━━━━━━

💰 • Баланс  
📊 • Топ участников  
🛒 • Магазин

━━━━━━━━━━━━━━━━━━

👑 Garcia Family`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("eco_balance").setStyle(ButtonStyle.Success).setEmoji("💰").setLabel("Баланс"),
        new ButtonBuilder().setCustomId("eco_top").setStyle(ButtonStyle.Secondary).setEmoji("📊").setLabel("Топ"),
        new ButtonBuilder().setCustomId("eco_shop").setStyle(ButtonStyle.Primary).setEmoji("🛒").setLabel("Магазин")
    );

    if (client.ecoMessage) client.ecoMessage.edit({ embeds: [embed], files: [file], components: [row] });
    else client.ecoMessage = await channel.send({ embeds: [embed], files: [file], components: [row] });
}

// ------------------------------------------------------------
// BUTTONS + COMMANDS
// ------------------------------------------------------------
client.on("interactionCreate", async i => {

    if (i.isChatInputCommand() && i.commandName === "afkpanel") {
        client.afkMessage = null;
        updateAFKPanel(i.guild);
        return i.reply({ content: "✅ AFK панель создана", ephemeral: true });
    }

    if (i.customId === "afk_on") {
        const modal = new ModalBuilder().setCustomId("afk_modal").setTitle("Уход в AFK");
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Причина").setStyle(TextInputStyle.Paragraph)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("hours").setLabel("Время AFK (1-8 часов)").setStyle(TextInputStyle.Short))
        );
        return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "afk_modal") {
        const reason = i.fields.getTextInputValue("reason");
        const hours = Math.max(1, Math.min(8, parseInt(i.fields.getTextInputValue("hours"))));
        const until = new Date(Date.now() + hours * 60 * 60 * 1000);

        afk.set(i.user.id, { reason, untilDate: until });
        updateAFKPanel(i.guild);
        return i.reply({ content: "✅ Ты теперь в AFK!", ephemeral: true });
    }

    if (i.customId === "afk_off") {
        afk.delete(i.user.id);
        updateAFKPanel(i.guild);
        return i.reply({ content: "👋 Добро пожаловать обратно!", ephemeral: true });
    }

    // Economy panel
    if (i.isChatInputCommand() && i.commandName === "econpanel") {
        client.ecoMessage = null;
        updateEconomyPanel();
        return i.reply({ content: "✅ Панель экономики создана", ephemeral: true });
    }

    if (i.customId === "eco_balance") {
        const bal = users[i.user.id]?.coins || 0;
        return i.reply({ content: `💰 У тебя **${bal.toFixed(1)} coin**`, ephemeral: true });
    }

    if (i.customId === "eco_top") {
        const sorted = Object.entries(users).sort((a, b) => b[1].coins - a[1].coins).slice(0, 10);

        const embed = new EmbedBuilder()
            .setColor("#FFD43B")
            .setTitle("📊 Топ по coin");

        let txt = "";
        sorted.forEach(([uid, data], idx) => {
            txt += `**${idx + 1})** <@${uid}> — **${data.coins.toFixed(1)} coin**\n`;
        });

        embed.setDescription(txt || "Пока пусто...");
        return i.reply({ embeds: [embed], ephemeral: true });
    }

    if (i.customId === "eco_shop") {
        return i.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("#8e44ad")
                    .setTitle("🛒 Магазин")
                    .setDescription(`🟣 FULL RIGHTS — **${FULL_RIGHTS_PRICE} coin**`)
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("buy_fullrights").setStyle(ButtonStyle.Primary).setEmoji("🟣").setLabel("Купить")
                )
            ],
            ephemeral: true
        });
    }

    if (i.customId === "buy_fullrights") {
        if (!users[i.user.id] || users[i.user.id].coins < FULL_RIGHTS_PRICE)
            return i.reply({ content: "🚫 Недостаточно coin!", ephemeral: true });

        users[i.user.id].coins -= FULL_RIGHTS_PRICE;
        saveUsers();

        const role = i.guild.roles.cache.get(FULL_RIGHTS_ROLE);
        i.member.roles.add(role);

        return i.reply({ content: "✅ Роль FULL RIGHTS выдана!", ephemeral: true });
    }

    if (i.isChatInputCommand() && i.commandName === "addcoins") {
        if (!i.member.permissions.has("Administrator"))
            return i.reply({ content: "⛔ Нет прав!", ephemeral: true });

        const user = i.options.getUser("user");
        const amount = i.options.getInteger("amount");

        if (!users[user.id]) users[user.id] = { coins: 0, minutes: 0 };
        users[user.id].coins += amount;
        saveUsers();

        return i.reply({ content: `✅ Выдано **${amount} coin** <@${user.id}>`, ephemeral: true });
    }

    if (i.isChatInputCommand() && i.commandName === "removecoins") {
        if (!i.member.permissions.has("Administrator"))
            return i.reply({ content: "⛔ Нет прав!", ephemeral: true });

        const user = i.options.getUser("user");
        const amount = i.options.getInteger("amount");

        if (!users[user.id]) users[user.id] = { coins: 0, minutes: 0 };
        users[user.id].coins = Math.max(users[user.id].coins - amount, 0);
        saveUsers();

        return i.reply({ content: `❌ Забрано **${amount} coin** у <@${user.id}>`, ephemeral: true });
    }
});

// ------------------------------------------------------------
client.once("ready", async () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    await registerCommands();
});

client.login(TOKEN);

