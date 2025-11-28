# 🤝 One Way: AI-Driven Goal Collaboration & Shared Finance

One Way is a full-stack web application designed to connect users who share similar long-term goals and facilitate their collaboration using a shared financial wallet governed by collective, AI-judged decision-making.

## 🌟 Intro

Many ambitious personal and professional goals (ee.g., "build a sustainable mobile app" or "write a non-fiction book") require collaboration and funding. One Way leverages **semantic similarity** (using a local NLP model) to match users based on the *meaning* of their goals, creating small, highly aligned teams. It then provides tools—real-time chat and a shared, secure wallet—to manage their journey, where the Gemini AI acts as a neutral third-party judge for spending proposals.

## 🛠️ How It Works

The application is structured into three main phases:

### 1. Matching (NLP Core)

* **Goal Embedding:** When a user signs up, their goal description is converted into a high-dimensional vector (an embedding) using a local, browser-compatible NLP model (`Xenova/all-MiniLM-L6-v2` in `similarity.js`).
* **Similarity Check:** The new goal's embedding is compared against the embeddings of existing goal groups using **Cosine Similarity**.
* **Grouping:** If the similarity score exceeds a threshold (e.g., 0.85), the user is instantly added to the existing, best-matched group. If no match is found, a new group is created based on their unique goal.

### 2. Shared Wallet (Stripe & MongoDB)

* **Fund Contribution:** Users can securely contribute funds to their shared group wallet using **Stripe Payment Intents**.
* **Atomic Transactions:** The server uses MongoDB's atomic operators (`$inc`, `$push`) and an **idempotency check** based on Stripe Payment Intent IDs to prevent double-counting contributions and ensure the `walletBalance` is always accurate.

### 3. Collaboration & Governance (Socket.IO & Gemini AI)

* **Real-time Communication:** The `collaborate.html` page connects via **Socket.IO** to enable real-time chat and push notifications (e.g., "Funds added," "New proposal").
* **Spending Proposals:** Any user can create a proposal to spend money from the shared wallet (e.g., "$50 for server hosting").
* **AI Judgement (The Veto):** If the group cannot reach a consensus, any member can invoke the **Gemini AI Judge** (`app.js`).
    * The AI is provided the original **Group Goal**, the **Proposal Details**, and the **Group Votes** as context.
    * It renders a final verdict (`Pay` or `Cancel`) and a brief reason, prioritizing alignment with the group's primary goal.
    * If the AI approves, the server atomically deducts the amount, provided the funds exist.


## ✨ Features

* **Semantic Goal Matching:** Connects users based on the *meaning* of their goals, not just keywords.
* **Secure Shared Wallet:** Uses Stripe for contributions and robust database logic for preventing double-spending.
* **Real-time Group Chat:** WebSocket-based communication for instant collaboration.
* **AI Governance:** Gemini serves as a neutral, third-party judge for spending disputes, ensuring expenses align with the group's mission.
* **Atomic Financial Operations:** Database transactions are designed to be atomic and idempotent for financial integrity.

## 💻 Tech Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Backend** | **Node.js / Express** | Routing, API handling, and application orchestration. |
| **Database** | **MongoDB** | Persistent storage for users, goals, wallet balances, and proposals. |
| **NLP/Matching** | **`@xenova/transformers`** | Client-side feature extraction (embeddings) for goal similarity. |
| **AI Judgement** | **Google Gemini 2.5 Flash** | Decision-making for spending proposals (JSON output). |
| **Real-time** | **Socket.IO** | Bi-directional communication for chat and proposal updates. |
| **Payments** | **Stripe** | Secure handling of financial contributions and payment intents. |
| **Frontend** | **HTML, CSS, JavaScript** | Simple, secure user interface for auth, matching, and collaboration. |

## 🚀 Getting Started

### Prerequisites

* Node.js (LTS recommended)
* MongoDB Atlas (or local instance)
* Stripe Secret Key (Test mode is fine)
* Gemini API Key

### Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd one-way
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment:**
    Create a `.env` file and populate it with your keys (as seen in the uploaded `.env` file):
    ```
    PORT=3000
    MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/...
    STRIPE_SECRET_KEY=sk_test_...
    GEMINI_API_KEY=AIzaSy...
    ```
4.  **Run the server:**
    ```bash
    node app.js
    ```

### Usage

1.  Open your browser to `http://localhost:3000`.
2.  **Sign Up:** Enter a username, password, and a detailed goal description.
3.  **Matching:** The app will automatically redirect to the `/match` page, where the NLP model runs to find the best existing group or create a new one.
4.  **Collaborate:** Once matched, you are redirected to the `/collaborate` room for real-time chat and wallet management.

## 📐 System Design and Architecture

### Data Models (MongoDB Collections)

| Collection | Key Fields | Purpose |
| :--- | :--- | :--- |
| `uNameGoal` | `uName`, `password`, `goal`, `goalId` | Stores user credentials and links users to their collaborative group. |
| `mGoalUsers` | `goalId`, `mGoal`, `usersId`, `walletBalance`, `transactions` | Central entity for the group, shared goal text, member list, and financials. |
| `proposals` | `proposalId`, `goalId`, `requester`, `status`, `votes`, `aiReason` | Records all spending proposals and the outcome of the voting/AI judgement process. |

### Matching Architecture (Xenova)

The decision to use **Xenova/all-MiniLM-L6-v2** is a significant architectural trade-off. It allows the core NLP model to be loaded and run **client-side** (in the browser), offloading the server from running a heavy embedding model. This keeps the matching endpoint fast and scalable.

### Potential System Improvements

* **Idempotency Check for Proposals:** Currently, only Stripe payments are idempotent. Add a uniqueness constraint on proposals (e.g., using a combination of `requester` and `description` hash) to prevent accidental duplicate submission.
* **Async Goal Embedding:** Pre-calculate and cache the embedding vectors for all `mGoalUsers` upon creation, instead of recalculating them on every user match request, which would drastically reduce matching latency.

## 📊 DSA Analysis and Potential Improvements

### Goal Matching

* **Algorithm:** **Cosine Similarity** (a metric of the angle between two vectors).
* **Data Structures:** High-dimensional **Vectors** (embeddings).
* **Analysis:** This is an $O(N \times D)$ operation per comparison, where $N$ is the number of goals to compare against, and $D$ is the embedding dimension (constant). It's highly effective for semantic meaning.
* **Improvement:** For millions of users, the linear scan (`Promise.all` over `allGoals`) becomes too slow. Replace the goal list with a specialized data structure like a **Vector Database Index (e.g., using HNSW)** for Approximate Nearest Neighbor (ANN) search, achieving near real-time, logarithmic complexity for matching.

### Shared Wallet

* **Algorithm:** **Atomic Increment/Decrement (`$inc`)**.
* **Analysis:** This is a crucial concurrency control technique provided by MongoDB. By using `$inc` and the conditional check (`$ne: paymentIntentId`), the system ensures that multiple simultaneous contributions or withdrawals do not lead to race conditions or incorrect balance calculations.

## 📈 Performance Metrics

| Metric | Description | Expected Value / Impact |
| :--- | :--- | :--- |
| **Matching Latency** | Time taken from login to finding a group. | **Moderate (2-5 seconds).** Dominated by loading the NLP model (first time) and calculating all Cosine Similarity scores. |
| **Proposal Judgement Latency** | Time taken for Gemini to return a verdict. | **High (3-6 seconds).** Dominated by the external Gemini API network call. |
| **Concurrency** | Ability to handle multiple simultaneous contributions. | **High.** Due to the use of atomic database operators and Stripe webhooks (simulated here with `verify-contribution`). |
| **Similarity Accuracy** | How closely the match truly reflects the user's intent. | **High.** The `all-MiniLM-L6-v2` model is excellent for short-text semantic matching. |

## ⚖️ Trade-offs: Why Use That?

| Trade-off | Rationale for Current Choice |
| :--- | :--- |
| **NLP in Browser vs. Server** | **Chosen:** Browser NLP (Xenova). Trading initial loading time for faster subsequent matching and offloading server compute/memory, which is critical for a matching service. |
| **LLM for Governance** | **Chosen:** Gemini for Proposal Veto. This introduces latency but solves the human problem of **dispute resolution** by introducing a demonstrably neutral, unbiased judge, ensuring governance is objective and focused on the core goal. |
| **Stripe Integration** | **Chosen:** Full Stripe API over manual bank transfers. Provides immediate, secure financial auditability and compliance, which is essential for a shared wallet system. |
| **Password Hashing** | **Chosen:** `bcrypt`. The high computational cost of hashing is accepted because it guarantees the highest level of security against credential theft. |

## 🔮 Future Updates

* **Group Milestones:** Implement a feature to allow users to define structured, sequential milestones for their goal (e.g., "Phase 1: Wireframing").
* **Automated Proposal Generation:** Use the Gemini API to analyze the group's chat history and suggest necessary spending proposals (e.g., "The group discussed server costs five times; suggest a $50 hosting proposal").
* **User Reputation Score:** Track the voting history and contribution consistency of users to generate a reputation score, which could weigh their vote more heavily in pending proposals.
