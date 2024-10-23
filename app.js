const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(bodyParser.json());

const dbPath = path.join(__dirname, "finance.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Create Tables
    await db.run(`
      CREATE TABLE IF NOT EXISTS categories(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN('income', 'expense'))
      )`);

    await db.run(`
      CREATE TABLE IF NOT EXISTS transactions(
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        type TEXT NOT NULL CHECK(type IN('income', 'expense')),
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        description TEXT 
      )`);

    // Start Server
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.error(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// POST /transactions
app.post("/transactions", async (request, response) => {
  try {
    const transactionDetails = request.body;
    const { type, category, amount, date, description } = transactionDetails;

    const addTransactionQuery = `
      INSERT INTO transactions(type, category, amount, date, description)
      VALUES(
        '${type}',
        '${category}',
        ${amount},  // No quotes for numeric value
        '${date}',
        '${description}'
      );`;

    const dbResponse = await db.run(addTransactionQuery);
    const transactionId = dbResponse.lastID;

    response.send({ transactionId });
  } catch (error) {
    response.status(500).send({ error: "Error while adding transaction" });
  }
});

// GET /transactions - Retrieve all transactions
app.get("/transactions", async (request, response) => {
  try {
    const getTransactionsQuery = `
      SELECT * 
      FROM transactions 
      ORDER BY id;`;  // Use 'id' instead of 'transaction_id'

    const transactionsArray = await db.all(getTransactionsQuery);
    response.send(transactionsArray);
  } catch (error) {
    response.status(500).send({ error: "Error while fetching transactions" });
  }
});

// GET /transactions/:transactionId - Retrieve transaction by ID
app.get("/transactions/:transactionId", async (request, response) => {
  const { transactionId } = request.params;

  try {
    const getTransactionIdQuery = `
      SELECT * 
      FROM transactions 
      WHERE id = ${transactionId};`;

    const transaction = await db.get(getTransactionIdQuery);

    if (transaction) {
      response.send(transaction);
    } else {
      response.status(404).send({ error: "Transaction not found" });
    }
  } catch (error) {
    response.status(500).send({ error: "Error while fetching transaction" });
  }
});

// PUT /transactions/:transactionId - Update a transaction by ID
app.put("/transactions/:transactionId", async (request, response) => {
  const { transactionId } = request.params;
  const transactionDetails = request.body;
  const { type, category, amount, date, description } = transactionDetails;

  const updateTransactionQuery = `
    UPDATE transactions
    SET 
      type = '${type}',
      category = '${category}',
      amount = ${amount},
      date = '${date}',
      description = '${description}' 
    WHERE id = ${transactionId};`;

  try {
    const result = await db.run(updateTransactionQuery);

    if (result.changes === 0) {
      response.status(404).send({ error: "Transaction not found" });
    } else {
      response.send("Transaction Updated Successfully");
    }
  } catch (error) {
    response.status(500).send({ error: "Error while updating transaction" });
  }
});

// DELETE /transactions/:transactionId - Delete a transaction by ID 
app.delete("/transactions/:transactionId", async (request, response) => {
  const { transactionId } = request.params;  

  try {
    const deleteTransactionQuery = `
      DELETE FROM transactions  
      WHERE id = ${transactionId};`;  

    await db.run(deleteTransactionQuery);
    response.send("Transaction Deleted Successfully");
  } catch (error) {
    response.status(500).send({ error: "Error while deleting transaction" });
  }
});

// GET /summary - GET a Summary of Transactions (total income, expenses, balance)
app.get("/summary", async (request, response) => {
  try {
    const rows = await db.all(`
      SELECT type, SUM(amount) AS total 
      FROM transactions 
      GROUP BY type;
    `);

    const summary = {
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
    };

    rows.forEach((row) => {
      if (row.type === 'income') {
        summary.totalIncome = row.total;
      } else {
        summary.totalExpense = row.total;
      }
    });

    summary.balance = summary.totalIncome - summary.totalExpense;
    response.send(summary);
  } catch (error) {
    response.status(500).send({ error: error.message });
  }
});
