import {
    MongoClient
} from "mongodb";
const uri = "";

const client = new MongoClient(uri);

export default async function connectDb() {
    try {
        await client.connect();
        const db = client.db('oneWay');
        return db;
    } catch (error) {
        console.log("Can't connect");
        throw error;
    }

}