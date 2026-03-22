const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "mytoken123";

// 🔑 IMPORTANT
const TOKEN = "YOUR_PERMANENT_TOKEN";
const PHONE_NUMBER_ID = "YOUR_PHONE_NUMBER_ID";
const SHEET_URL = "YOUR_GOOGLE_SCRIPT_URL";

const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const users = {};

// 🔹 VERIFY WEBHOOK
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 🔥 MAIN BOT
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;
        const text = message.text?.body?.toLowerCase();

        // 🔹 Fetch sheet data
        const sheetRes = await axios.get(SHEET_URL);
        const flow = sheetRes.data.flow;
        const services = sheetRes.data.services;
        const config = sheetRes.data.config || [];

        const flowData = flow.slice(1).map(r => ({
            step: r[0],
            type: r[1],
            message: r[2],
            options: r[3],
            next: r[4]
        }));

        // 🔹 Config
        const configObj = {};
        config.slice(1).forEach(r => configObj[r[0]] = r[1]);

        // 🔹 Init user
        if (!users[from]) users[from] = { step: "start" };

        let currentStep = users[from].step;
        let stepData = flowData.find(s => s.step === currentStep);

        // 🔹 Save data
        if (currentStep === "name") users[from].name = text;
        if (currentStep === "service") users[from].service = text;
        if (currentStep === "contact") users[from].sameNumber = text;

        // 🔹 Replace variables
        let msg = stepData.message || "";
        msg = msg.replace("{{name}}", users[from].name || "");

        // 🔥 HANDLE TYPES

        if (stepData.type === "text") {
            await sendText(from, msg);
        }

        if (stepData.type === "button") {
            let opts = stepData.options.split(",").slice(0, 3);
            await sendButtons(from, msg, opts);
        }

        // 🔥 ACTION → SEND SAMPLE
        if (stepData.type === "action") {

            if (users[from].service) {

                const filtered = services.slice(1).filter(r =>
                    r[0].toLowerCase() === users[from].service.toLowerCase()
                );

                for (let row of filtered) {
                    const type = row[2];
                    const content = row[3];

                    if (type === "image") {
                        await sendImage(from, content);
                    } else {
                        await sendText(from, content);
                    }
                }
            }
        }

        // 🔹 Move next
        users[from].step = stepData.next;

        // 🔹 Next step auto
        let nextStep = flowData.find(s => s.step === users[from].step);

        if (nextStep) {
            let nextMsg = nextStep.message || "";
            nextMsg = nextMsg.replace("{{name}}", users[from].name || "");

            if (nextStep.type === "text") {
                await sendText(from, nextMsg);
            }

            if (nextStep.type === "button") {
                let opts = nextStep.options.split(",").slice(0, 3);
                await sendButtons(from, nextMsg, opts);
            }
        }

        // 🔥 SAVE LEAD + NOTIFY
        if (users[from].step === "end") {

            await axios.post(SHEET_URL, {
                name: users[from].name,
                phone: from,
                service: users[from].service,
                sameNumber: users[from].sameNumber
            });

            if (configObj.notify === "on") {
                await sendText(
                    configObj.owner_number,
                    `🔥 New Lead\n👤 ${users[from].name}\n📞 ${from}\n💼 ${users[from].service}`
                );
            }

            users[from] = { step: "start" };
        }

    } catch (err) {
        console.log("ERROR:", err.response?.data || err.message);
    }

    res.sendStatus(200);
});

// 🔹 SEND TEXT
async function sendText(to, message) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        text: { body: message }
    }, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        }
    });
}

// 🔹 BUTTONS
async function sendButtons(to, message, options) {
    const buttons = options.map(opt => ({
        type: "reply",
        reply: {
            id: opt,
            title: opt.substring(0, 20)
        }
    }));

    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: message },
            action: { buttons }
        }
    }, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        }
    });
}

// 🔹 IMAGE
async function sendImage(to, url) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: url }
    }, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        }
    });
}

app.listen(3000, () => console.log("🚀 Server running"));
