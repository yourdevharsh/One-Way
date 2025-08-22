import http from 'node:http';
import express from "express";
import path from "path";
import connectDb from './db.js';
import similarity from './similarity.js';
import {
    fileURLToPath
} from 'node:url';
import {
    dirname
} from 'node:path';
import {
    Server
} from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);


const __filename = fileURLToPath(
    import.meta.url);
const __dirname = dirname(__filename);


app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const db = await connectDb();
console.log("connected");

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.post('/signin', async (req, res, next) => {
    const data = req.body;
    console.log(data);

    const collection = db.collection('uNameGoal');

    collection.findOne({
        uName: `${data.uName}`
    }).
    then(document => {
        if (document) {
            console.log("already exists");
            res.status(406).end("Username already exist");

        } else {
            collection.insertOne({
                uName: `${data.uName}`,
                goal: `${data.goal}`
            });
            console.log("success");
            res.status(200).send("Done");
        }
    });
});

// app.use((req, res) => {
//     const data = req.body;
//     const {uName, goal} = data;

//     const goalsCollection = db.collection('mGoalUsers');

// });

app.get('/match/:user', async (req, res) => {
    const data = req.params;
    const username = data.user;
    const gColl = db.collection("mGoalUsers");
    const uColl = db.collection("uNameGoal");
    const result = await uColl.findOne({
        uName: username
    });

    if (result.goalId) {
        console.log("Show list of all matched users");
    } else {
        const arrGoals = await gColl.aggregate([{
            $project: {
                "goalId": 1,
                "mGoal": 1
            }
        }]).toArray();

        const simScore = arrGoals.map(obj => ({
            goalId: obj.goalId,
            sim: similarity(obj.mGoal, result.goal)
        }));

        const bestMatch = simScore.reduce((best, cur) =>
            cur.sim > best.sim ? cur : best
        );

        if (bestMatch.sim >= 0.85) {
            gColl.updateOne({
                goalId: bestMatch.goalId
            }, {
                $push: {
                    usersId: username
                }
            })
        } else {
            gColl.insertOne({
                mGoal: result.goal,
                usersId: [result.uName],
                goalId: Date.now()
            });

            await uColl.updateOne({
                uName: username
            }, {
                $set: {
                    goalId: bestMatch.goalId
                }
            });
        }


    }
    res.end("result");
});

app.get('/collaborate/:goalId', async (req, res) => {
    const goalId = req.params.goalId;

    const gColl = db.collection("mGoalUsers");

    const usersList = await gColl.aggregate([{
            $match: {
                goalId: goalId
            }
        },
        {
            $project: {
                usersId: 1,
                _id: 0
            }
        }
    ]).toArray();

    io.on('connection', (socket) => {
        socket.on('join room', (goalId, username) => {
            // store info on socket
            socket.goalId = goalId;
            socket.username = username;

            // join the room
            socket.join(goalId);
            io.to(goalId).emit('user connected', `${username} joined`);

            // chat inside this room
            socket.on('chat message', (msg) => {
                io.to(goalId).emit('chat message', {
                    user: username,
                    text: msg
                });
            });

            // handle disconnect
            socket.on('disconnect', (reason) => {
                console.log("Disconnect", reason);
                io.to(goalId).emit('notification', `${username} left`);
            });
        });
    });

});


app.use((err, req, res, next) => {
    console.error("Fatal");
    res.status(500).end(err);
});


server.listen(3000, () => {
    console.log("listening");
});