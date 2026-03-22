const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const TOKEN = "EAA3QMwOB59gBQxydPFRss2cSJdweXHTuWZCEgleOM273EipShQGlNW7ZB0ynPhyzuZAZC4o8f9BDDDC5hDcACQvv8GntYW7oYzf2jxWzH0mODZBQuVsIiBcAIusZArmge1fZC3AT7kvYwoRbyj5yhgIsYCQrhc96GFhEc39HzLcVm5MFqYP5dXIg77supRTb0MrMAZDZD";

const PHONE_ID = "1079760248545797";
const VERIFY_TOKEN = "mytoken123";
const SHEET_URL = "https://script.google.com/macros/s/AKfycbyDhXlZuupN5RNcj63WcG8DNF1hTyln3q8oqvIf7IByWxS5qZqwjLjZaD_20m8szyeU/exec";

const users = {};

// 🔹 Webhook verify
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// 🔹 Receive message
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;
        const text = (message.text?.body || "").toLowerCase();
        const replyId =
            message.interactive?.button_reply?.id ||
            message.interactive?.list_reply?.id;

        if (!users[from]) users[from] = { step: 1 };

        // STEP 1
        if (users[from].step === 1) {
            await sendText(from, "Hey 👋 Welcome to IT Monkey!\nPlease enter your full name 😊");
            users[from].step = 2;
        }

        // STEP 2
        else if (users[from].step === 2) {
            const name = text.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            users[from].name = name;

            await sendServiceList(from, `Nice to meet you ${name} 😊\nChoose a service 👇`);
            users[from].step = 3;
        }

        // STEP 3
        else if (users[from].step === 3) {
            users[from].service = (replyId || text || "").toLowerCase();

            await sendYesNo(from, "Would you like to see sample work? 👀");
            users[from].step = 3.5;
        }

        // STEP 3.5 (DYNAMIC FROM SHEET)
        else if (users[from].step === 3.5) {
            const answer = (replyId || text || "").toLowerCase();

            if (answer.includes("yes")) {

                const services = await getServices();

                const matched = services.filter(s =>
                    s.service.toLowerCase() === users[from].service
                );

                if (matched.length === 0) {
                    await sendText(from, "No samples available right now.");
                }

                for (let item of matched) {

                    if (item.type === "image") {
                        await sendImage(from, item.content);
                    }

                    if (item.type === "link") {
                        await sendText(from, item.content);
                    }
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
            const answer = (replyId || text || "").toLowerCase();

            if (answer.includes("yes")) {
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

            // ✅ FINAL MESSAGE FIXED
            await sendText(from,
`🎉 Thank you, ${users[from].name}!  

Your request has been successfully received ✅  

Our team will connect with you shortly on your provided contact details 📞  

If it’s urgent, feel free to call us directly at:  
📲 *8504852601*  

We’re excited to work with you! 🚀✨`
            );

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
                        { id: "digital_marketing", title: "Digital Marketing 📈" },
                        { id: "shoot", title: "Content Shoot 🎬" },
                        { id: "consulting", title: "Consulting 💡" },
                        { id: "automation", title: "Automation 🤖" },
                        { id: "design", title: "Graphic Design 🎨" },
                        { id: "other", title: "Other 🔧" }
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

// 🔹 FETCH SERVICES FROM SHEET
async function getServices() {
    const res = await axios.get(`${SHEET_URL}?type=services`);
    const rows = res.data;
    const headers = rows[0];

    return rows.slice(1).map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
    });
}

// 🔹 SAVE LEADS
async function saveToSheet(data) {
    await axios.post(SHEET_URL, data);
}

// 🔹 NOTIFY OWNER
async function notifyOwner(data) {
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
}

app.listen(3000, () => console.log("🚀 Running"));
