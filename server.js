const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// ===== CONFIG =====
const VERIFY_TOKEN = "mytoken123";

const TOKEN = "EAA3QMwOB59gBQxydPFRss2cSJdweXHTuWZCEgleOM273EipShQGlNW7ZB0ynPhyzuZAZC4o8f9BDDDC5hDcACQvv8GntYW7oYzf2jxWzH0mODZBQuVsIiBcAIusZArmge1fZC3AT7kvYwoRbyj5yhgIsYCQrhc96GFhEc39HzLcVm5MFqYP5dXIg77supRTb0MrMAZDZD";

const PHONE_NUMBER_ID = "1079760248545797";

const SHEET_URL = "https://script.google.com/macros/s/AKfycbzFn2eze-GAbxP0HEQQrQl25qFiuDUhdnIJEgfdmISIq1SB2oYVt6OGtGsTwAt0_vNR/exec";

const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const users = {};

// ===== VERIFY =====
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// ===== MAIN =====
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
        let raw = (await axios.get(SHEET_URL)).data;

        if (typeof raw === "string") {
            try { raw = JSON.parse(raw); } catch {}
        }

        const flow = raw.flow || [];
        const services = raw.services || [];
        const config = raw.config || [];

        // ===== FLOW CLEAN =====
        const flowData = flow.slice(1).map(r => ({
            step: (r[0] || "").toString().trim(),
            type: (r[1] || "").toString().trim(),
            message: (r[2] || "").toString().trim(),
            options: (r[3] || "").toString().trim(),
            next: (r[4] || "").toString().trim()
        }));

        // ===== CONFIG =====
        const configObj = {};
        config.slice(1).forEach(r => {
            configObj[(r[0] || "").toString().trim()] =
                (r[1] || "").toString().trim();
        });

        // ===== USER INIT =====
        if (!users[from]) users[from] = { step: "start" };

        // ===== RESTART =====
        if (replyId === "start_over") {
            users[from] = { step: "start" };
            await sendText(from, "🔁 Restarted\nEnter your name 😊");
            return res.sendStatus(200);
        }

        let step = users[from].step;
        let stepData = flowData.find(s => s.step === step);

        if (!stepData) {
            users[from].step = "start";
            step = "start";
            stepData = flowData.find(s => s.step === "start");
        }

        // ===== NAME =====
        if (step === "name") {
            users[from].name = text;
            users[from].step = "service";

            step = users[from].step;
            stepData = flowData.find(s => s.step === step);
        }

        // ===== SERVICE =====
        if (step === "service" && replyId) {
            users[from].service = replyId;
        }

        // ===== CONTACT =====
        if (step === "contact") {
            users[from].sameNumber = replyId || text;
        }

        let msg = (stepData.message || "")
            .replace("{{name}}", users[from].name || "");

        // ===== TEXT =====
        if (stepData.type === "text") {
            await sendText(from, msg);
        }

        // ===== BUTTON =====
        if (stepData.type === "button") {

            let opts = [];

            if (stepData.step === "service") {

                let serviceNames = services.slice(1).map(r =>
                    (r[0] || "").toString().trim()
                ).filter(Boolean);

                serviceNames = [...new Set(serviceNames)];

                console.log("SERVICES:", serviceNames);

                if (serviceNames.length === 0) {
                    serviceNames = ["social_media", "design", "automation"];
                }

                opts = serviceNames;

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

            const selected = users[from].service;

            const filtered = services.slice(1).filter(r =>
                (r[0] || "").toString().trim() === selected
            );

            for (let row of filtered) {

                const type = (row[2] || "").toString().trim();
                const content = (row[3] || "").toString().trim();

                if (type === "image") {
                    await sendImage(from, content);
                } else {
                    await sendText(from, content);
                }
            }
        }

        // ===== MOVE NEXT =====
        if (step !== "name") {
            users[from].step = stepData.next;
        }

        let next = flowData.find(s => s.step === users[from].step);

        if (next) {
            let nextMsg = (next.message || "")
                .replace("{{name}}", users[from].name || "");

            if (next.type === "text") {
                await sendText(from, nextMsg);
            }

            if (next.type === "button") {
                let opts = next.options
                    ? next.options.split(",").map(o => o.trim())
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

// ===== SEND =====

async function sendText(to, message) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        text: { body: message }
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
}

async function sendButtons(to, message, options) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: message },
            action: {
                buttons: options.map(o => ({
                    type: "reply",
                    reply: { id: o, title: o.substring(0, 20) }
                }))
            }
        }
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
}

async function sendImage(to, url) {
    await axios.post(API_URL, {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: url }
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
}

app.listen(3000, () => console.log("🚀 Running"));
