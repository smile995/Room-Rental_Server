const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 5000;

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    } else {
      req.user = decoded;
      next();
    }
  });
};

const uri = `mongodb+srv://${process.env.DATABASE_USER_NAME}:${process.env.DATABASE_PASSWORD}@cluster0.6uwuu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // auth related api
    const roomsCollection = client.db("Room_Rental").collection("rooms");
    const usersCollection = client.db("Room_Rental").collection("users");
    // rooms related apis are blew
    app.post("/rooms", async (req, res) => {
      const room = req.body;
      try {
        const result = await roomsCollection.insertOne(room);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    app.get("/rooms/:email", async (req, res) => {
      const { email } = req.params;
      const query = { "host.email": email };
      try {
        const result = await roomsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    app.delete("/rooms/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      try {
        const result = await roomsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    app.get("/rooms", async (req, res) => {
      try {
        const { category } = req.query;
        let query = {};
        if (category !== "null") {
          query = { category };
        }
        const result = await roomsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });
    app.get("/room/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await roomsCollection.findOne(query);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });
    // users related apis are below
    app.put("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const isExist = await usersCollection.findOne(query);

      if (!!isExist && user?.status === "Requested") {
        const updatedDoc = {
          $set: {
            status: user?.status,
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      } else {
        const result = await usersCollection.insertOne(user);
        res.send(result);
      }
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Room Rental Server..");
});

app.listen(port, () => {
  console.log(`Room Rental is running on port ${port}`);
});
