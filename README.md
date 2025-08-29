# One Way 🎯

One Way is a web application designed to connect individuals who share similar goals. Using AI-powered semantic similarity, the platform automatically groups users with common objectives, providing them with a dedicated space to collaborate and communicate in real time.

## 🚀 How it Works

The application operates through a streamlined process to match and connect users:

1. **Sign Up with a Goal**: A user signs up by providing their username and a detailed description of their goal (e.g., "learn to play the guitar," "run a marathon in under 4 hours").

2. **AI-Powered Analysis**: The backend receives the user's goal and uses a sophisticated Transformer model (`Xenova/all-MiniLM-L6-v2`) to generate a vector embedding. This embedding represents the semantic meaning of the goal text.

3. **Similarity Matching**: The user's goal embedding is compared against a database of existing "master goals" by calculating the cosine similarity. This determines how closely the new goal aligns with existing ones.

4. **Automatic Grouping**:

   * If the similarity score is **85% or higher**, the user is automatically added to the group of users who share that master goal.

   * If no sufficiently similar goal is found, a new master goal is created, and the user becomes the first member of a new group.

5. **Real-Time Collaboration**: Once grouped, users receive a unique `goalId` that gives them access to a private chat room. They can join this room to discuss progress, share resources, and collaborate with their matched peers.

## ✨ Features

* **AI Goal Matching**: Intelligently groups users by understanding the meaning behind their goals, not just keywords.

* **Real-Time Chat**: Each goal group gets a dedicated chat room powered by WebSockets for instant communication.

* **Dynamic Group Creation**: Automatically creates new communities as unique goals are introduced.

* **Scalable Backend**: Built with Node.js and MongoDB to handle numerous users and goals.

## 🛠️ Tech Stack

* **Backend**: Node.js, Express.js

* **Database**: MongoDB

* **Real-time Communication**: Socket.IO

* **AI / Natural Language Processing**: `@xenova/transformers` for text embeddings and cosine similarity calculation.

* **Frontend**: HTML, CSS, JavaScript

## ⚙️ Setup and Installation

Follow these steps to get the project running on your local machine.

### Prerequisites

* **Node.js**: Ensure you have Node.js installed (v14 or later is recommended).

* **MongoDB**: You need a running MongoDB instance (either local or cloud-based like MongoDB Atlas).

### Installation Steps

1. **Clone the repository:**

   ```bash
   git clone [https://github.com/your-username/one-way.git](https://github.com/your-username/one-way.git)
   cd one-way
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure the database:**
   Open the `db.js` file and replace the empty `uri` string with your MongoDB connection string.

   ```javascript
   const uri = "YOUR_MONGODB_CONNECTION_STRING_HERE";
   ```

4. **Run the server:**

   ```bash
   node app.js
   ```

   The application server will start, and you should see a "connected" message in your console, indicating a successful database connection.

## 🔌 API Endpoints

* `POST /signin`

  * Registers a new user.

  * **Body**: `{ "uName": "username", "goal": "user's goal description" }`

* `GET /match/:user`

  * Triggers the matching process for the specified user.

* **Socket.IO Events**

  * The client connects to the server and emits a `join room` event with the `goalId` and `username` to enter the collaborative chat space.

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
