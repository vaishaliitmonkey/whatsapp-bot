const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===== YOUR REAL VALUES =====
const TOKEN = "EAA3QMwOB59gBQxydPFRss2cSJdweXHTuWZCEgleOM273EipShQGlNW7ZB0ynPhyzuZAZC4o8f9BDDDC5hDcACQvv8GntYW7oYzf2jxWzH0mODZBQuVsIiBcAIusZArmge1fZC3AT7kvYwoRbyj5yhgIsYCQrhc96GFhEc39HzLcVm5MFqYP5dXIg77supRTb0MrMAZDZD";

const PHONE_NUMBER_ID = "1079760248545797";

const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

// ===== MEMORY =====
let users = {};

// ===== SERVICES (NO DUPLICATE ISSUE NOW) =====
const SERVICES = [
    { id: "social_media", title: "Social Media 🚀" },
    { id: "design", title: "Graphic Design 🎨" },
    { id: "automation", title: "Automation ⚙️" }
];

// ===== SEND TEXT =====
async function sendText(to, text) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        text: { body: text }
    }, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        }
    });
}

// ===== SEND LIST =====
async function sendList(to, text, options) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "list",
            body: { text },
            action: {
                button: "Select Service",
                sections: [
                    {
                        title: "Services",
                        rows: options.map(o => ({
                            id: o.id,
                            title: o.title
                        }))
                    }
                ]
            }
        }
    }, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        }
    });
}

// ===== SEND BUTTONS =====
async function sendButtons(to, text, buttons) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text },
            action: {
                buttons: buttons.map(b => ({
                    type: "reply",
                    reply: { id: b, title: b }
                }))
            }
        }
    }, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        }
    });
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;

        const input =
            message.text?.body ||
            message.interactive?.button_reply?.id ||
            message.interactive?.list_reply?.id ||
            "";

        const text = input.toLowerCase().trim();

        // INIT USER
        if (!users[from]) {
            users[from] = { step: "start" };
        }

        // RESET
        if (text === "start_over") {
            users[from] = { step: "start" };
            await sendText(from, "🔄 Restarted\nEnter your name 😊");
            return res.sendStatus(200);
        }

        let step = users[from].step;

        // ===== FLOW =====

        if (step === "start") {
            await sendText(from, "Hey 👋 Welcome to IT Monkey!\nPlease enter your full name 😊");
            users[from].step = "name";
            return res.sendStatus(200);
        }

        if (step === "name") {
            users[from].name = text;
            users[from].step = "service";

            await sendList(from, "Select service 🚀", SERVICES);
            return res.sendStatus(200);
        }

        if (step === "service") {
            users[from].service = text;
            users[from].step = "sample";

            await sendButtons(from, "Would you like to see sample work? 👀", ["yes", "no"]);
            return res.sendStatus(200);
        }

        if (step === "sample") {
            users[from].step = "done";

            await sendText(from, "Thank you 😊\nOur team will contact you shortly!\n\nCall 8504852601 for urgent queries.");
            return res.sendStatus(200);
        }

        return res.sendStatus(200);

    } catch (err) {
        console.log("ERROR:", err.response?.data || err.message);
        return res.sendStatus(500);
    }
});

// ===== VERIFY =====
app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = "mytoken123";

    if (
        req.query["hub.mode"] === "subscribe" &&
        req.query["hub.verify_token"] === VERIFY_TOKEN
    ) {
        return res.status(200).send(req.query["hub.challenge"]);
    }

    res.sendStatus(403);
});

// ===== START =====
app.listen(3000, () => {
    console.log("🚀 Server running");
});
