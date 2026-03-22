const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// ===== YOUR CONFIG =====
const VERIFY_TOKEN = "mytoken123";

const TOKEN = "EAA3QMwOB59gBQxydPFRss2cSJdweXHTuWZCEgleOM273EipShQGlNW7ZB0ynPhyzuZAZC4o8f9BDDDC5hDcACQvv8GntYW7oYzf2jxWzH0mODZBQuVsIiBcAIusZArmge1fZC3AT7kvYwoRbyj5yhgIsYCQrhc96GFhEc39HzLcVm5MFqYP5dXIg77supRTb0MrMAZDZD";

const PHONE_NUMBER_ID = "1079760248545797";

const SHEET_URL = "https://script.google.com/macros/s/AKfycbzFn2eze-GAbxP0HEQQrQl25qFiuDUhdnIJEgfdmISIq1SB2oYVt6OGtGsTwAt0_vNR/exec";

const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

// =======================

const users = {};

// VERIFY
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// MAIN WEBHOOK
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;
        const text = message.text?.body?.toLowerCase().trim() || "";
        const replyId =
            message.interactive?.button_reply?.id ||
            message.interactive?.list_reply?.id;

        // ===== FETCH SHEET =====
        const sheetRes = await axios.get(SHEET_URL);

        let raw = sheetRes.data;

        if (typeof raw === "string") {
            try {
                raw = JSON.parse(raw);
            } catch (e) {
                console.log("❌ JSON PARSE ERROR");
                raw = {};
            }
        }

        const data = raw || {};

        const flow = data.flow || [];
        const services = data.services || [];
        const config = data.config || [];

        // ===== PARSE FLOW =====
        const flowData = flow.slice(1).map(r => ({
            step: r[0],
            type: r[1],
            message: r[2],
            options: r[3],
            next: r[4]
        }));

        // ===== CONFIG =====
        const configObj = {};
        config.slice(1).forEach(r => configObj[r[0]] = r[1]);

        // ===== INIT USER =====
        if (!users[from]) users[from] = { step: "start" };

        // ===== RESTART =====
        if (replyId === "start_over") {
            users[from] = { step: "start" };
            await sendText(from, "🔁 Restarted\nEnter your name 😊");
            return res.sendStatus(200);
        }

        let currentStep = users[from].step;
        let stepData = flowData.find(s => s.step === currentStep);

        if (!stepData) {
            users[from].step = "start";
            stepData = flowData.find(s => s.step === "start");
        }

        // ===== SAVE INPUT =====
        if (currentStep === "name") {
            users[from].name = text;
            users[from].step = "service"; // 🔥 FIX LOOP
        }

        if (currentStep === "service") {
            users[from].service = (replyId || text).toLowerCase().trim();
        }

        if (currentStep === "contact") {
            users[from].sameNumber = replyId || text;
        }

        let msg = (stepData.message || "").replace("{{name}}", users[from].name || "");

        // ===== TEXT =====
        if (stepData.type === "text") {
            await sendText(from, msg);
        }

        // ===== BUTTON =====
        if (stepData.type === "button") {

            let opts = [];

            if (stepData.step === "service") {

                let uniqueServices = [];

                if (Array.isArray(services) && services.length > 1) {
                    uniqueServices = [...new Set(
                        services
                            .slice(1)
                            .map(r => r[0])
                            .filter(s => s && s !== "service")
                    )];
                }

                console.log("SERVICES:", uniqueServices);

                if (uniqueServices.length === 0) {
                    uniqueServices = ["social_media", "design", "automation"];
                }

                opts = uniqueServices;

            } else {
                opts = stepData.options
                    ? stepData.options.split(",").map(o => o.trim())
                    : [];
            }

            opts.push("start_over");

            await sendButtons(from, msg, opts);
        }

        // ===== SAMPLE ACTION =====
        if (stepData.type === "action") {
            const selectedService = users[from].service;

            const filtered = services.slice(1).filter(r =>
                r[0]?.toLowerCase().trim() === selectedService
            );

            for (let row of filtered) {
                if (row[2] === "image") {
                    await sendImage(from, row[3]);
                } else {
                    await sendText(from, row[3]);
                }
            }
        }

        // ===== MOVE NEXT =====
        if (currentStep !== "name") {
            users[from].step = stepData.next;
        }

        let nextStep = flowData.find(s => s.step === users[from].step);

        if (nextStep) {
            let nextMsg = (nextStep.message || "").replace("{{name}}", users[from].name || "");

            if (nextStep.type === "text") {
                await sendText(from, nextMsg);
            }

            if (nextStep.type === "button") {
                let opts = nextStep.options
                    ? nextStep.options.split(",").map(o => o.trim())
                    : [];

                opts.push("start_over");

                await sendButtons(from, nextMsg, opts);
            }
        }

        // ===== SAVE LEAD =====
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
        console.log("❌ ERROR:", err.response?.data || err.message);
    }

    res.sendStatus(200);
});

// ===== SENDERS =====

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

// ===== START SERVER =====
app.listen(3000, () => console.log("🚀 Server running"));
