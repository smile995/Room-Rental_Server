const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SK);

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
    const db = client.db("Room_Rental");
    const roomsCollection = db.collection("rooms");
    const usersCollection = db.collection("users");
    const bookingsCollection = db.collection("bookings");
    // verify middlewires
    // Verify Token Middleware
    const verifyToken = async (req, res, next) => {
      const token = req.cookies?.token;
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

    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const isAdmin = await usersCollection.findOne(query);
      if (!isAdmin || isAdmin.role !== "admin") {
        return res.send({ message: "Unauthorized Access" }).status(401);
      } else {
        next();
      }
    };

    const verifyHost = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const isAdmin = await usersCollection.findOne(query);
      if (!isAdmin || isAdmin.role !== "host") {
        return res.send({ message: "Unauthorized Access" }).status(401);
      } else {
        next();
      }
    };
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

    app.get("/rooms/:email", verifyToken, verifyHost, async (req, res) => {
      const { email } = req.params;
      const query = { "host.email": email };
      try {
        const result = await roomsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    app.delete("/rooms/:id", verifyToken, verifyHost, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      try {
        const result = await roomsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });
    app.patch("/rooms/:id", verifyToken, verifyHost, async (req, res) => {
      const { id } = req.params;
      const roomData= req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc={
        $set:{
          ...roomData,
          isBooked:false
        }
      }
      try {
        const result = await roomsCollection.updateOne(query,updatedDoc);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    app.get("/rooms", async (req, res) => {
      try {
        const { category } = req.query;
        let query = { isBooked: false };
        if (category !== "null") {
          query = { ...query, category };
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
      } else if (!isExist) {
        const result = await usersCollection.insertOne(user);
        res.send(result);
      }
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/role/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result?.role);
    });

    app.patch("/users/update-role/:email",verifyToken,verifyAdmin,async (req, res) => {
        const { email } = req.params;
        const data = req.body;
        const query = { email: email };
        const updatedDoc = {
          $set: {
            role: data?.role,
            status: "verified",
            timeStamp: Date.now(),
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

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
      } catch (err) {
        res.status(500).send(err);
      }
    });
    // create payments intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const priceInCents = parseInt(price * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: priceInCents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
        });

        res.send({ paymentIntent: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // update room status then its booked
    app.patch("/update-status/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          isBooked: status,
        },
      };
      const result = await roomsCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // booking related apis are below
    app.post("/bookings", verifyToken, async (req, res) => {
      const data = req.body;
      delete data._id;
      const result = await bookingsCollection.insertOne(data);
      res.send(result);
    });

    app.get("/my-booking/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const query = { "guest.customerEmail": email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result).status(200);
    });
    app.get(
      "/manage-booking/:email",
      verifyToken,
      verifyHost,
      async (req, res) => {
        const { email } = req.params;
        const query = { "host.email": email };
        const result = await bookingsCollection.find(query).toArray();
        res.send(result).status(200);
      }
    );

    app.post("/manage/my-bookings/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { roomId } = req.body;
      const bookingDeleteQuery = { _id: new ObjectId(id) };
      const updateRoomQuery = { _id: new ObjectId(roomId) };
      const updatedDoc = {
        $set: {
          isBooked: false,
        },
      };

      try {
        const deleteBooking = await bookingsCollection.deleteOne(
          bookingDeleteQuery
        );
        const updateRoomAvailable = await roomsCollection.updateOne(
          updateRoomQuery,
          updatedDoc
        );
        res.send({ deleteBooking, updateRoomAvailable });
      } catch (error) {
        res.send(error.message);
      }
    });
    // admin,host, guest stat details
    app.get("/admin-stat", verifyToken, verifyAdmin, async (req, res) => {
      const totalUsers = await usersCollection.estimatedDocumentCount();
      const rooms = await roomsCollection.estimatedDocumentCount();
      const totalBookings = await bookingsCollection
        .find(
          {},
          {
            projection: {
              price: 1,

              bookingDate: 1,
            },
          }
        )
        .toArray();

      const chartData = totalBookings.map((booking) => {
        const day = new Date(booking?.bookingDate).getDate();
        const month = new Date(booking?.bookingDate).getMonth() + 1;
        return [`${day}/${month}`, booking?.price];
      });

      chartData.unshift(["Date", "Sales"]);
      const totalPrice = totalBookings.reduce(
        (sum, booking) => sum + booking.price,
        0
      );

      res.send({
        totalUsers,
        rooms,
        totalBookings,
        totalPrice,
        totalbooking: totalBookings?.length,
        chartData,
      });
    });
    app.get("/guest-stat", verifyToken, async (req, res) => {
      const { email } = req?.user;
      const query = { "guest.customerEmail": email };
      const totalBookings = await bookingsCollection
        .find(query, {
          projection: {
            price: 1,

            bookingDate: 1,
          },
        })
        .toArray();

      const chartData = totalBookings.map((booking) => {
        const day = new Date(booking?.bookingDate).getDate();
        const month = new Date(booking?.bookingDate).getMonth() + 1;
        return [`${day}/${month}`, booking?.price];
      });
      const createdAt = await usersCollection.findOne(
        { email: email },
        {
          projection: {
            timeStamp: 1,
          },
        }
      );
      const timeStamp = createdAt?.timeStamp;
      const enteredDate = new Date(timeStamp);
      const currentDate = new Date();
      const diffInMs = currentDate - enteredDate;
      const daysAgo = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      chartData.unshift(["Date", "Sales"]);
      const totalPrice = totalBookings.reduce(
        (sum, booking) => sum + booking.price,
        0
      );

      res.send({
        totalBookings: totalBookings?.length,
        totalPrice,
        chartData,
        daysAgo,
      });
    });
    app.get("/host-stat", verifyToken, verifyHost, async (req, res) => {
      const { email } = req?.user;
      const query = { "host.email": email };
      const totalBookings = await bookingsCollection
        .find(query, {
          projection: {
            price: 1,

            bookingDate: 1,
          },
        })
        .toArray();
      const totalRooms = await roomsCollection.find(query).toArray();
      const chartData = totalBookings.map((booking) => {
        const day = new Date(booking?.bookingDate).getDate();
        const month = new Date(booking?.bookingDate).getMonth() + 1;
        return [`${day}/${month}`, booking?.price];
      });
      const createdAt = await usersCollection.findOne(
        { email: email },
        {
          projection: {
            timeStamp: 1,
          },
        }
      );
      const timeStamp = createdAt?.timeStamp;
      const enteredDate = new Date(timeStamp);
      const currentDate = new Date();
      const diffInMs = currentDate - enteredDate;
      const daysAgo = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      chartData.unshift(["Date", "Sales"]);
      const totalPrice = totalBookings.reduce(
        (sum, booking) => sum + booking.price,
        0
      );

      res.send({
        totalBookings: totalBookings?.length,
        totalPrice,
        chartData,
        daysAgo,
        totalRooms:totalRooms?.length
      });
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
