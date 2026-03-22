const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// 🔥 FIXED TOKEN (NO "Bearer" here)
const TOKEN = "EAA3QMwOB59gBQxydPFRss2cSJdweXHTuWZCEgleOM273EipShQGlNW7ZB0ynPhyzuZAZC4o8f9BDDDC5hDcACQvv8GntYW7oYzf2jxWzH0mODZBQuVsIiBcAIusZArmge1fZC3AT7kvYwoRbyj5yhgIsYCQrhc96GFhEc39HzLcVm5MFqYP5dXIg77supRTb0MrMAZDZD";

const PHONE_ID = "1079760248545797";
const SHEET_URL = "https://script.google.com/macros/s/AKfycbyDhXlZuupN5RNcj63WcG8DNF1hTyln3q8oqvIf7IByWxS5qZqwjLjZaD_20m8szyeU/exec";
const VERIFY_TOKEN = "mytoken123";

const users = {};

// 🔹 Webhook verification
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// 🔹 Incoming messages
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;
        const text = message.text?.body?.toLowerCase();
        const replyId =
            message.interactive?.button_reply?.id ||
            message.interactive?.list_reply?.id;

        if (!users[from]) users[from] = { step: 1 };

        console.log("User:", from, "Step:", users[from].step);

        // ================= FLOW =================

        // STEP 1
        if (users[from].step === 1) {
            await sendText(from, "Hey 👋 Welcome to IT Monkey!\nPlease enter your full name 😊");
            users[from].step = 2;
        }

        // STEP 2
        else if (users[from].step === 2) {
            const name = text
                ?.split(" ")
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");

            users[from].name = name;

            await sendServiceList(from, `Nice to meet you ${name} 😊\nChoose a service 👇`);
            users[from].step = 3;
        }

        // STEP 3
        else if (users[from].step === 3) {
            users[from].service = replyId || text;

            await sendYesNo(from, "Would you like to see sample work? 👀");
            users[from].step = 3.5;
        }

        // STEP 3.5 (SAMPLE)
        else if (users[from].step === 3.5) {
            const answer = replyId || text;

            console.log("STEP 3.5:", answer);

            if (answer === "yes") {

                if (users[from].service === "social_media") {
                    await sendText(from, "Check our work:\nhttps://itmonkey.in");
                }
                else if (users[from].service === "design") {
                    await sendImage(from, "https://itmonkey.in/wp-content/uploads/2023/02/db2222-e1677611131516.png");
                }
                else {
                    await sendText(from, "Check our portfolio:\nhttps://itmonkey.in");
                }

                await sendYesNo(from, "Would you like to proceed further? 🚀");
                users[from].step = 3.6;

            } else {
                await sendYesNo(from, "Is this your calling number as well? 📲");
                users[from].step = 4;
            }
        }

        // STEP 3.6
        else if (users[from].step === 3.6) {
            const answer = replyId || text;

            if (answer === "yes") {
                await sendYesNo(from, "Great! Is this your calling number? 📲");
                users[from].step = 4;
            } else {
                await sendText(from, "No problem 😊 Come back anytime!");
                users[from].step = 1;
            }
        }

        // STEP 4
        else if (users[from].step === 4) {
            users[from].sameNumber = replyId || text;

            const lead = {
                name: users[from].name,
                phone: from,
                service: users[from].service,
                sameNumber: users[from].sameNumber
            };

            await saveToSheet(lead);
            await notifyOwner(lead);

            await sendText(from, `🎉 Thank you ${users[from].name}!\nWe will contact you shortly.\n📞 8504852601`);

            users[from].step = 1;
        }

    } catch (err) {
        console.log("❌ ERROR:", err.response?.data || err.message);
    }

    res.sendStatus(200);
});

// ================= FUNCTIONS =================

async function sendText(to, text) {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
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

async function sendImage(to, url) {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
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

async function sendServiceList(to, text) {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "list",
            body: { text },
            action: {
                button: "Select Service",
                sections: [{
                    title: "Services",
                    rows: [
                        { id: "social_media", title: "Social Media 🚀" },
                        { id: "design", title: "Graphic Design 🎨" },
                        { id: "automation", title: "Automation 🤖" }
                    ]
                }]
            }
        }
    }, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        }
    });
}

async function sendYesNo(to, text) {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "yes", title: "Yes ✅" } },
                    { type: "reply", reply: { id: "no", title: "No ❌" } }
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

async function saveToSheet(data) {
    try {
        await axios.post(SHEET_URL, data);
        console.log("📊 Saved");
    } catch (err) {
        console.log("Sheet Error:", err.message);
    }
}

async function notifyOwner(data) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
            messaging_product: "whatsapp",
            to: "918504852601",
            text: {
                body: `🚨 New Lead\n${data.name}\n${data.service}\n${data.phone}`
            }
        }, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            }
        });
    } catch (err) {
        console.log("Notify Error:", err.response?.data || err.message);
    }
}

app.listen(3000, () => console.log("🚀 Running"));
