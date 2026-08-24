const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();
app.use(cors());

// storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

// test route
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

// upload route
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  res.json({
    message: "Upload successful",
    file: req.file.filename,
  });
});

// start server
app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});