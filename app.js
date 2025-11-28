import http from "node:http";
import express from "express";
import path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Server } from "socket.io";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import dotenv from "dotenv";

import connectDb from "./db.js";
import calculateSimilarity from "./similarity.js";

// --- Basic Setup ---
dotenv.config(); // Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Initialize
const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_YOUR_SECRET_KEY_HERE"
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- Middleware ---
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// --- Database Connection ---
let db;
try {
  db = await connectDb();
  console.log("Successfully connected to MongoDB.");
} catch (err) {
  console.error("Failed to connect to MongoDB", err);
  process.exit(1);
}

// --- Socket.IO Connection Handling ---
io.on("connection", (socket) => {
  console.log(`A user connected with socket id: ${socket.id}`);

  socket.on("join room", ({ goalId, username }) => {
    if (!goalId || !username) return;
    socket.goalId = Number(goalId);
    socket.username = username;
    socket.join(socket.goalId.toString());
    console.log(`${username} (${socket.id}) joined room: ${socket.goalId}`);

    socket
      .to(socket.goalId.toString())
      .emit("user connected", `${username} has joined the chat.`);
  });

  socket.on("chat message", (msg) => {
    if (socket.goalId && socket.username) {
      io.to(socket.goalId.toString()).emit("chat message", {
        user: socket.username,
        text: msg,
      });
    }
  });

  socket.on("proposal update", () => {
    if (socket.goalId) {
        io.to(socket.goalId.toString()).emit("refresh proposals");
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.username || socket.id} disconnected.`);
    if (socket.goalId && socket.username) {
      io.to(socket.goalId.toString()).emit(
        "user disconnected",
        `${socket.username} has left the chat.`
      );
    }
  });
});

// --- HTML Serving Routes ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/match", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "match.html"));
});

app.get("/collaborate/:goalId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "collaborate.html"));
});

// --- Authentication Routes (Signup/Login) ---
app.post("/signup", async (req, res) => {
  const { uName, password, goal } = req.body;
  if (!uName || !password || !goal) {
    return res.status(400).json({ message: "All fields required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password too short." });
  }

  try {
    const collection = db.collection("uNameGoal");
    const existingUser = await collection.findOne({ uName });
    if (existingUser) {
      return res.status(409).json({ message: "Username exists." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await collection.insertOne({
      uName,
      password: hashedPassword,
      goal,
      goalId: null,
    });
    res.status(201).json({ message: "User created." });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/login", async (req, res) => {
  const { uName, password } = req.body;
  try {
    const collection = db.collection("uNameGoal");
    const user = await collection.findOne({ uName });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    res.status(200).json({ message: "Login successful.", uName: user.uName });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});

// --- Matching Route ---
app.get("/match/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const uColl = db.collection("uNameGoal");
    const gColl = db.collection("mGoalUsers");

    const user = await uColl.findOne({ uName: username });
    if (!user) return res.status(404).json({ message: "User not found." });

    if (user.goalId) {
      const goalGroup = await gColl.findOne({ goalId: user.goalId });
      return res.status(200).json(goalGroup);
    }

    const allGoals = await gColl
      .find({}, { projection: { goalId: 1, mGoal: 1 } })
      .toArray();
    let bestMatch = { goalId: null, sim: -1 };

    if (allGoals.length > 0) {
      const similarityScores = await Promise.all(
        allGoals.map(async (goal) => ({
          goalId: goal.goalId,
          sim: await calculateSimilarity(goal.mGoal, user.goal),
        }))
      );
      bestMatch = similarityScores.reduce(
        (best, cur) => (cur.sim > best.sim ? cur : best),
        bestMatch
      );
    }

    if (bestMatch.sim >= 0.85) {
      await gColl.updateOne(
        { goalId: bestMatch.goalId },
        { $addToSet: { usersId: username } }
      );
      await uColl.updateOne(
        { uName: username },
        { $set: { goalId: bestMatch.goalId } }
      );
      const updatedGoal = await gColl.findOne({ goalId: bestMatch.goalId });
      return res.status(200).json(updatedGoal);
    } else {
      const newGoalId = Date.now();
      await gColl.insertOne({
        mGoal: user.goal,
        usersId: [user.uName],
        goalId: newGoalId,
        walletBalance: 0,
        transactions: [],
      });
      await uColl.updateOne(
        { uName: username },
        { $set: { goalId: newGoalId } }
      );
      const newGoal = await gColl.findOne({ goalId: newGoalId });
      return res.status(201).json(newGoal);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error." });
  }
});

// --- Collaboration & Wallet Routes ---


// Get current wallet balance

app.get("/wallet/:goalId", async (req, res) => {
  try {
    const goalId = Number(req.params.goalId);
    const goal = await db.collection("mGoalUsers").findOne({ goalId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });

    res.json({ balance: goal.walletBalance || 0 });
  } catch (e) {
    res.status(500).json({ message: "Error fetching balance" });
  }
});


// Step 1: Create Payment Intent
app.post("/create-payment-intent", async (req, res) => {
  const { amount, goalId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "usd",
      metadata: { goalId: goalId.toString() },
      automatic_payment_methods: { enabled: true },
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: e.message });
  }
});

// Step 2: Securely Verify and Update Balance
app.post("/verify-contribution", async (req, res) => {
  const { paymentIntentId, goalId } = req.body;

  try {
    // 1. Retrieve the intent from Stripe to ensure it's actually valid and paid
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== "succeeded") {
      return res.status(400).json({ message: "Payment not successful" });
    }

    const amountAdded = intent.amount / 100; // Convert cents back to dollars
    const gId = Number(goalId);

    // 2. Atomic Update with Idempotency Check
    // We add the Intent ID to 'transactions'. The query checks if this ID is NOT currently in the array.
    // If it is already there, the update will modify 0 documents.
    const result = await db.collection("mGoalUsers").updateOne(
      {
        goalId: gId,
        transactions: { $ne: paymentIntentId }, // Prevent double counting
      },
      {
        $inc: { walletBalance: amountAdded }, // Atomic increment
        $push: { transactions: paymentIntentId },
      }
    );

    if (result.modifiedCount === 0) {
      // Either goal not found OR transaction already processed
      const check = await db.collection("mGoalUsers").findOne({ goalId: gId });
      if (check && check.transactions.includes(paymentIntentId)) {
        return res
          .status(200)
          .json({ message: "Already processed", balance: check.walletBalance });
      }
      return res.status(404).json({ message: "Update failed" });
    }

    // 3. Get updated balance
    const updatedGoal = await db
      .collection("mGoalUsers")
      .findOne({ goalId: gId });

    // 4. Notify everyone in the room
    io.to(goalId.toString()).emit("wallet update", {
      balance: updatedGoal.walletBalance,
      message: `Funds added: $${amountAdded}`,
    });

    res.json({ success: true, newBalance: updatedGoal.walletBalance });
  } catch (e) {
    console.error("Verification Error:", e);
    res.status(500).json({ message: "Verification failed" });
  }
});

// 1. Create a Proposal
app.post("/proposals/create", async (req, res) => {
  const { goalId, username, description, amount, recipient } = req.body;

  try {
    const proposalId = Date.now().toString();
    const newProposal = {
      proposalId,
      goalId: Number(goalId),
      requester: username,
      description,
      amount: Number(amount),
      recipient,
      status: "PENDING", // PENDING, APPROVED, REJECTED
      votes: [], // Array of { user, vote: 'yes'|'no', comment }
      aiReason: null,
      createdAt: new Date(),
    };

    await db.collection("proposals").insertOne(newProposal);

    io.to(goalId.toString()).emit(
      "notification",
      `New spending proposal by ${username}: $${amount}`
    );
    io.to(goalId.toString()).emit("refresh proposals"); // Tell clients to reload list

    res.status(201).json({ message: "Proposal created" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error creating proposal" });
  }
});

// 2. Get Proposals for a Goal
app.get("/proposals/:goalId", async (req, res) => {
  try {
    const goalId = Number(req.params.goalId);
    // Get active proposals first
    const proposals = await db
      .collection("proposals")
      .find({ goalId })
      .sort({ status: 1, createdAt: -1 }) // Pending first, then by date
      .toArray();
    res.json(proposals);
  } catch (e) {
    res.status(500).json({ message: "Error fetching proposals" });
  }
});

// 3. Vote on a Proposal
app.post("/proposals/vote", async (req, res) => {
  const { proposalId, username, vote, comment } = req.body;

  try {
    await db.collection("proposals").updateOne(
      { proposalId },
      {
        $pull: { votes: { user: username } },
      }
    );

    await db.collection("proposals").updateOne(
      { proposalId },
      {
        $push: { votes: { user: username, vote, comment } },
      }
    );

    const prop = await db.collection("proposals").findOne({ proposalId });
    io.to(prop.goalId.toString()).emit("refresh proposals");

    res.json({ message: "Vote recorded" });
  } catch (e) {
    res.status(500).json({ message: "Error voting" });
  }
});

// 4. Finalize with Gemini (The Judge)

app.post("/proposals/finalize", async (req, res) => {
  const { proposalId } = req.body;

  try {
    const proposal = await db.collection("proposals").findOne({ proposalId });
    const goalData = await db
      .collection("mGoalUsers")
      .findOne({ goalId: proposal.goalId });

    if (!proposal || proposal.status !== "PENDING") {
      return res
        .status(400)
        .json({ message: "Proposal not valid for finalization." });
    }

    // 1. Prepare Context for AI
    const prompt = `
            You are the Treasurer AI for a collaborative group.
            
            Group Goal: "${goalData.mGoal}"
            Current Wallet Balance: $${goalData.walletBalance}
            
            The Request:
            - User "${proposal.requester}" wants to spend $${proposal.amount}.
            - Recipient/Details: "${proposal.recipient}"
            - Reason: "${proposal.description}"
            
            Group Votes:
            ${proposal.votes
              .map(
                (v) =>
                  `- ${v.user} voted ${v.vote.toUpperCase()}: "${v.comment}"`
              )
              .join("\n")}
            
            Task:
            Analyze if this expense aligns with the Group Goal and if the community supports it.
            You have VETO power, but should generally listen to the group unless it's a scam or completely unrelated to the goal.
            
            Return ONLY a JSON object (no markdown):
            {
                "decision": "Pay" or "Cancel",
                "reason": "Short explanation of your decision (max 2 sentences)."
            }
        `;

    // 2. Call Gemini
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response
      .text()
      .replace(/```json|```/g, "")
      .trim(); // Clean markdown
    const aiDecision = JSON.parse(text);

    let finalStatus = "REJECTED";
    let walletUpdated = false;

    // 3. Execute Decision
    if (aiDecision.decision === "Pay") {
      // Check balance and Deduct Atomically
      const updateResult = await db.collection("mGoalUsers").updateOne(
        {
          goalId: proposal.goalId,
          walletBalance: { $gte: proposal.amount }, // Ensure funds exist
        },
        { $inc: { walletBalance: -proposal.amount } }
      );

      if (updateResult.modifiedCount === 1) {
        finalStatus = "APPROVED";
        walletUpdated = true;
      } else {
        aiDecision.reason = "Approved by AI, but Insufficient Funds in Wallet.";
        finalStatus = "REJECTED";
      }
    }

    // 4. Update Proposal Record
    await db.collection("proposals").updateOne(
      { proposalId },
      {
        $set: {
          status: finalStatus,
          aiReason: aiDecision.reason,
        },
      }
    );

    // 5. Notify Group
    const notifMsg = walletUpdated
      ? `Proposal Approved! $${proposal.amount} sent to ${proposal.recipient}.`
      : `Proposal Rejected: ${aiDecision.reason}`;

    io.to(proposal.goalId.toString()).emit("wallet update", {
      balance: walletUpdated
        ? goalData.walletBalance - proposal.amount
        : goalData.walletBalance,
      message: notifMsg,
    });

    io.to(proposal.goalId.toString()).emit("refresh proposals");

    res.json({
      success: true,
      decision: aiDecision.decision,
      reason: aiDecision.reason,
    });
  } catch (e) {
    console.error("AI Error:", e);
    res.status(500).json({ message: "AI Judgement failed." });
  }
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
