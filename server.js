const TOKEN = "Bearer EAA3QMwOB59gBQxydPFRss2cSJdweXHTuWZCEgleOM273EipShQGlNW7ZB0ynPhyzuZAZC4o8f9BDDDC5hDcACQvv8GntYW7oYzf2jxWzH0mODZBQuVsIiBcAIusZArmge1fZC3AT7kvYwoRbyj5yhgIsYCQrhc96GFhEc39HzLcVm5MFqYP5dXIg77supRTb0MrMAZDZD";
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const users = {};
const VERIFY_TOKEN = "mytoken123";

// ✅ YOUR GOOGLE SHEET URL
const SHEET_URL = "https://script.google.com/macros/s/AKfycbyDhXlZuupN5RNcj63WcG8DNF1hTyln3q8oqvIf7IByWxS5qZqwjLjZaD_20m8szyeU/exec";

// 🔹 Webhook verification
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    } else {
        return res.sendStatus(403);
    }
});

// 🔹 Receive messages
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;

        const text = message.text?.body?.toLowerCase();
        const replyId =
            message.interactive?.button_reply?.id ||
            message.interactive?.list_reply?.id;

        if (!users[from]) {
            users[from] = { step: 1 };
        }

        // ================= FLOW =================

        if (users[from].step === 1) {

            await sendText(from,
`Hey there! 👋✨  
Welcome to *IT Monkey* 🐒💻  

Let’s get started — please enter your *full name* 😊`
            );

            users[from].step = 2;

        } else if (users[from].step === 2) {

            const name = text.split(" ")
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            users[from].name = name;

            await sendServiceList(from,
`Awesome to meet you, ${name}! 😄🔥  

Tell us what you’re looking for 👇`
            );

            users[from].step = 3;

      } else if (users[from].step === 3) {

    users[from].service = replyId || text;

    await sendYesNoButtons(from,
`Would you like to see some sample work? 👀`
    );

    users[from].step = 3.5;

            } else if (users[from].step === 3.5) {

    const answer = replyId || text;

    if (answer === "yes") {

        // 🔥 Send based on service
        if (users[from].service === "social_media") {

            await sendText(from,
"Here are some of our Social Media works:\nhttps://itmonkey.in");

        } else if (users[from].service === "design") {

            await sendImage(from,
"https://itmonkey.in/wp-content/uploads/2023/02/db2222-e1677611131516.png");

        } else {

            await sendText(from,
"Here are some of our works:\nhttps://your-link.com");
        }

        await sendYesNoButtons(from,
`Would you like to proceed further? 🚀`
        );

        users[from].step = 3.6;

    } else {

        // Skip sample → go to step 4
        await sendYesNoButtons(from,
`Quick check 📲  

Is this WhatsApp number your *calling number* as well?`
        );

        users[from].step = 4;
    }
            } else if (users[from].step === 3.6) {

    const answer = replyId || text;

    if (answer === "yes") {

        await sendYesNoButtons(from,
`Great! Let's continue 👇  

Is this WhatsApp number your *calling number* as well?`
        );

        users[from].step = 4;

    } else {

        await sendText(from,
"No worries 😊  
Let us know whenever you're ready!");
        
        users[from].step = 1;
    }

        } else if (users[from].step === 4) {

            users[from].sameNumber = replyId || text;

            // ✅ SAVE TO GOOGLE SHEET
            const leadData = {
    name: users[from].name,
    phone: from,
    service: users[from].service,
    sameNumber: users[from].sameNumber
};

await saveToSheet(leadData);
await notifyOwner(leadData);

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

    } catch (error) {
        console.log("❌ ERROR:", error.response?.data || error.message);
    }

    res.sendStatus(200);
});

// ================= FUNCTIONS =================

// 🔹 TEXT
async function sendText(to, message) {
    await axios.post(
        "https://graph.facebook.com/v18.0/1079760248545797/messages",
        {
            messaging_product: "whatsapp",
            to: to,
            text: { body: message }
        },
        {
            headers: {
Authorization: `Bearer ${TOKEN}`
    "Content-Type": "application/json"
            }
        }
    );
}

// 🔹 SERVICE LIST (fixed titles < 24 chars)
async function sendServiceList(to, message) {
    await axios.post(
        "https://graph.facebook.com/v18.0/1079760248545797/messages",
        {
            messaging_product: "whatsapp",
            to: to,
            type: "interactive",
            interactive: {
                type: "list",
                body: { text: message },
                action: {
                    button: "Select Service",
                    sections: [
                        {
                            title: "Our Services",
                            rows: [
                                { id: "social_media", title: "Social Media 🚀" },
                                { id: "digital_marketing", title: "Digital Marketing 📈" },
                                { id: "shoot", title: "Content Shoot 🎬" },
                                { id: "consulting", title: "Consulting 💡" },
                                { id: "automation", title: "Automation 🤖" },
                                { id: "design", title: "Graphic Design 🎨" },
                                { id: "other", title: "Other 🔧" }
                            ]
                        }
                    ]
                }
            }
        },
        {
            headers: {
Authorization: `Bearer ${TOKEN}`
    "Content-Type": "application/json"
            }
        }
    );
}

// 🔹 YES/NO BUTTONS
async function sendYesNoButtons(to, message) {
    await axios.post(
        "https://graph.facebook.com/v18.0/1079760248545797/messages",
        {
            messaging_product: "whatsapp",
            to: to,
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: message },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: "yes", title: "Yes ✅" } },
                        { type: "reply", reply: { id: "no", title: "No ❌" } }
                    ]
                }
            }
        },
        {
            headers: {
Authorization: `Bearer ${TOKEN}`
    "Content-Type": "application/json"
            }
        }
    );
}

async function sendImage(to, imageUrl) {
    await axios.post(
        "https://graph.facebook.com/v18.0/1079760248545797/messages",
        {
            messaging_product: "whatsapp",
            to: to,
            type: "image",
            image: { link: imageUrl }
        },
        {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}
// 🔹 SAVE TO GOOGLE SHEETS
async function saveToSheet(data) {
    try {
        await axios.post(SHEET_URL, data);
        console.log("📊 Lead saved to Google Sheets");
    } catch (err) {
        console.log("❌ Sheet Error:", err.message);
    }
}

async function notifyOwner(data) {
    const OWNER_NUMBER = "918504852601"; // your number (no +)

    const message = `🚨 New Lead Received!

👤 Name: ${data.name}
📞 Phone: ${data.phone}
💼 Service: ${data.service}
📲 Same Number: ${data.sameNumber}

🔥 Check Google Sheet now`;

    await axios.post(
        "https://graph.facebook.com/v18.0/1079760248545797/messages",
        {
            messaging_product: "whatsapp",
            to: OWNER_NUMBER,
            text: { body: message }
        },
        {
            headers: {
Authorization: `Bearer ${TOKEN}`
    "Content-Type": "application/json"
            }
        }
    );

    console.log("📲 Owner notified");
}


// 🔹 START SERVER
app.listen(3000, () => {
    console.log("🚀 Server running on port 3000");
});
