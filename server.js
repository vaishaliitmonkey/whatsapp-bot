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

// 🔹 delay
const delay = ms => new Promise(res => setTimeout(res, ms));

// 🔹 webhook verify
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// 🔹 main webhook
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

        console.log("STEP:", users[from].step, "INPUT:", replyId || text);

        // STEP 1
        if (users[from].step === 1) {
            await sendText(from, "Hey 👋 Welcome to IT Monkey!\nPlease enter your full name 😊");
            users[from].step = 2;
        }

        // STEP 2
        else if (users[from].step === 2) {
            const name = text.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            users[from].name = name;

            await sendDynamicServiceList(from, `Nice to meet you ${name} 😊\nChoose a service 👇`);
            users[from].step = 3;
        }

        // STEP 3
        else if (users[from].step === 3) {
            users[from].service = replyId;

            await sendYesNo(from, "Would you like to see sample work? 👀");
            users[from].step = 3.5;
        }

        // STEP 3.5
        else if (users[from].step === 3.5) {
            const answer = (replyId || text || "").toLowerCase();

            if (answer.includes("yes")) {

                const services = await getServices();

                const matched = services.filter(s => s.service === users[from].service);

                console.log("MATCHED:", matched);

                for (let item of matched) {
                    const type = (item.type || "").toLowerCase();

                    if (type === "image") {
                        await sendImage(from, item.content);
                        await delay(1000);
                    }

                    if (type === "link") {
                        await sendText(from, item.content);
                        await delay(1000);
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

            await sendText(from,
`🎉 Thank you, ${users[from].name}!  

Your request has been successfully received ✅  

Our team will connect with you shortly 📞  

📲 8504852601`
            );

            users[from].step = 1;
        }

    } catch (err) {
        console.log("❌ ERROR:", err.response?.data || err.message);
    }

    res.sendStatus(200);
});

// ================= FUNCTIONS =================

// 🔹 fetch services
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

// 🔹 dynamic service list
async function sendDynamicServiceList(to, text) {
    const services = await getServices();

    const unique = {};
    services.forEach(s => {
        unique[s.service] = s.title;
    });

    const rows = Object.keys(unique).map(key => ({
        id: key,
        title: unique[key].substring(0, 24)
    }));

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
                    rows
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

// 🔹 send text
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

// 🔹 send image
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

// 🔹 yes/no
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
                    { type: "reply", reply: { id: "yes", title: "Yes" } },
                    { type: "reply", reply: { id: "no", title: "No" } }
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

// 🔹 save lead
async function saveToSheet(data) {
    await axios.post(SHEET_URL, data);
}

// 🔹 notify
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
