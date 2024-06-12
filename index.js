const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
var jwt = require("jsonwebtoken");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middle ware

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://cozy-empanada-89974c.netlify.app",
    ],
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ssblxww.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const sessionCollection = client
      .db("assignment12DB")
      .collection("sessions");
    const userCollection = client.db("assignment12DB").collection("users");
    const noteCollection = client.db("assignment12DB").collection("notes");
    const materialCollection = client
      .db("assignment12DB")
      .collection("materials");
    const bookedCollection = client
      .db("assignment12DB")
      .collection("bookedSession");
    const reviewCollection = client.db("assignment12DB").collection("reviews");
    const purchaseCollection = client
      .db("assignment12DB")
      .collection("purchase");
    const feedbackCollection = client
      .db("assignment12DB")
      .collection("feedbacks");

    // use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verifyToken
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unAuthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // is admin
    // verifyAdmin,
    app.get(
      "/users/admin/:email",
      verifyToken,

      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "unauthorized access" });
        }
        const query = { email: email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user?.role === "admin";
        }
        res.send({ admin });
      }
    );

    // is tutor
    // verifyTutor,
    app.get(
      "/users/tutor/:email",
      verifyToken,

      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "unauthorized access" });
        }
        const query = { email: email };
        const user = await userCollection.findOne(query);
        let tutor = false;

        if (user) {
          tutor = user?.role === "tutor";
        }
        res.send({ tutor });
      }
    );

    // start users related api=============================================================>

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search || "";
      const searchString = String(search);
      let query = {
        name: { $regex: searchString, $options: "i" },
      };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // post user info in data base
    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user does't exist
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // delete user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // update  user status
    app.patch("/upUsers/:id", verifyToken, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: item.role,
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // =========End user related api==================================================================>

    // add session from tutor route(create session)
    app.post("/session", verifyToken, async (req, res) => {
      const item = req.body;
      const result = await sessionCollection.insertOne(item);
      res.send(result);
    });

    // tutor created session in dashboard route(my Sessions)
    app.get("/mySession/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { tutorEmail: email };
      const result = await sessionCollection.find(query).toArray();
      res.send(result);
    });

    // get session data for form update
    app.get("/upSession/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await sessionCollection.findOne(query);
      res.send(result);
    });

    app.put("/upSession/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const optional = { upsert: true };
      const data = {
        $set: {
          title: req.body.title,
          tutorName: req.body.tutorName,
          tutorEmail: req.body.tutorEmail,
          registrationStart: req.body.registrationStart,
          registrationEnd: req.body.registrationEnd,
          description: req.body.description,
          classStart: req.body.classStart,
          classEnd: req.body.classEnd,
          price: req.body.price,
        },
      };

      const result = await sessionCollection.updateOne(filter, data, optional);
      res.send(result);
    });

    // delete  session

    app.delete(
      "/delSession/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await sessionCollection.deleteOne(query);
        res.send(result);
      }
    );
    // ----------------------------------------------------
    // get session data for status update -- for admin
    app.get("/session/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await sessionCollection.findOne(query);
      res.send(result);
    });

    // update status
    app.patch("/updateSta/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedata = {
        $set: status,
      };
      const result = await sessionCollection.updateOne(query, updatedata);
      res.send(result);
    });

    // --------------------------------------------------------

    // update price

    app.get("/updatePrice/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await sessionCollection.findOne(query);
      res.send(result);
    });

    app.patch("/updatePrice/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedata = {
        $set: {
          price: item.price,
        },
      };
      const result = await sessionCollection.updateOne(query, updatedata);
      res.send(result);
    });

    // get all session
    app.get("/session", async (req, res) => {
      const result = await sessionCollection.find().toArray();
      res.send(result);
    });

    // get all session
    app.get("/sessionDetails", async (req, res) => {
      const result = await sessionCollection.find().toArray();
      res.send(result);
    });

    // get all approved session at home page
    app.get("/sessionAtHome", async (req, res) => {
      const query = { status: "Approved" };
      const result = await sessionCollection.find(query).toArray();
      res.send(result);
    });

    // applyAgain session
    app.post("/applyAgain", verifyToken, async (req, res) => {
      const applySession = req.body;
      const result = await materialCollection.insertOne(applySession);
      res.send(result);
    });

    // add note from student route(create note)
    app.post("/note", verifyToken, async (req, res) => {
      const item = req.body;
      const result = await noteCollection.insertOne(item);
      res.send(result);
    });

    // student created note in dashboard route(manage personal note)
    app.get("/myNotes/:email", async (req, res) => {
      const email = req.params.email;
      const query = { studentEmail: email };
      const result = await noteCollection.find(query).toArray();
      res.send(result);
    });

    // get note data for form update -- for student
    app.get("/upNote/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await noteCollection.findOne(query);
      res.send(result);
    });

    // update note by student
    app.put("/upNote/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const optional = { upsert: true };
      const data = {
        $set: {
          title: req.body.title,
          tutorEmail: req.body.tutorEmail,
          description: req.body.description,
        },
      };
      const result = await noteCollection.updateOne(filter, data, optional);
      res.send(result);
    });

    // delete note by student
    app.delete("/delNote/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await noteCollection.deleteOne(query);
      res.send(result);
    });

    // materials
    app.post("/materials", verifyToken, async (req, res) => {
      const material = req.body;
      const result = await materialCollection.insertOne(material);
      res.send(result);
    });

    // approved session
    app.get("/approvedSession/:email", async (req, res) => {
      const email = req.params.email;
      const query = { tutorEmail: email, status: "Approved" };
      const result = await sessionCollection.find(query).toArray();
      res.send(result);
    });

    // get materials uploaded by tutor
    app.get("/myMaterials/:email", async (req, res) => {
      const email = req.params.email;
      const query = { tutorEmail: email };
      const result = await materialCollection.find(query).toArray();
      res.send(result);
    });

    // get materials for admin
    app.get("/materialsForAdmin", async (req, res) => {
      const result = await materialCollection.find().toArray();
      res.send(result);
    });

    // delete material by tutor
    app.delete("/delMaterial/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await materialCollection.deleteOne(query);
      res.send(result);
    });

    // get data for update by tutor
    app.get("/upMaterial/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await materialCollection.findOne(query);
      res.send(result);
    });
    // patch by tutor
    app.patch("/upMaterial/:id", verifyToken, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          title: req.body.title,
          tutorEmail: req.body.tutorEmail,
          sessionId: req.body.sessionId,
          link: req.body.link,
          image: req.body.image,
        },
      };
      const result = await materialCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // get materials for student
    app.get("/materialsStu", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const result = await materialCollection
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // get count of the item for pagination
    app.get("/materialCount", async (req, res) => {
      const count = await materialCollection.countDocuments();
      res.send({ count });
    });

    // view all notes
    app.get("/noteForTutor", async (req, res) => {
      const result = await noteCollection.find().toArray();
      res.send(result);
    });

    // booking session

    app.post("/bookingSession", async (req, res) => {
      const session = req.body;
      const result = await bookedCollection.insertOne(session);
      res.send(result);
    });

    // booked session

    app.get("/bookedSessions/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await bookedCollection.find(query).toArray();
      res.send(result);
    });

    // get booked for details page
    app.get("/bookedeStudent", async (req, res) => {
      const result = await purchaseCollection.find().toArray();
      res.send(result);
    });

    // post review by student
    app.post("/feedBack", async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    // get review
    app.get("/showReview", async (req, res) => {
      // const id = req.params.id;
      // const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // post feedback by admin
    app.post(
      "/rejectionFeedBack",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const review = req.body;
        const result = await feedbackCollection.insertOne(review);
        res.send(result);
      }
    );

    // get feedback in tutor dashboard
    app.get("/rejectionFeedBack", async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });

    // ===========payment =================================

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;

      if (!price || priceInCent < 1) return;

      // Create a PaymentIntent with the order amount and currency
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: client_secret,
      });
    });

    // purchase  session
    app.post("/purchaseSession", verifyToken, async (req, res) => {
      const purchase = req.body;
      const result = await purchaseCollection.insertOne(purchase);
      res.send(result);
    });

    // get booked  session
    app.get("/getPurchaseSession/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await purchaseCollection.find(query).toArray();
      res.send(result);
    });
    // ====================================================

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Assignment is Running");
});

app.listen(port, () => {
  console.log(`Assignment 12 is Running on Port: ${port}`);
});
