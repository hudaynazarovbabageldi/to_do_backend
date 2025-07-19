const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const AppError = require('../utils/appError');
const exportObject = {};

exportObject.register = async (req, res, next) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    next(new AppError('username, password, and email properties are required', 400));
    return;
  }

  try {
    const userCheckQuery = `SELECT * FROM users WHERE username = $1 OR email = $2`;
    const userCheckResult = await pool.query(userCheckQuery, [username, email]);

    if (userCheckResult.rows.length > 0) {
      const conflictProperties = [];
      if (userCheckResult.rows.some((user) => user.username === username)) {
        conflictProperties.push('username');
      }
      if (userCheckResult.rows.some((user) => user.email === email)) {
        conflictProperties.push('email');
      }
      return res.status(409).json({ status: 'conflict', conflictProperties });
    }

    console.log('CLIENT_JWT_KEY:', process.env.CLIENT_JWT_KEY);

    const hashPassword = await bcrypt.hash(password, 10);
    const insertUserQuery = `
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3) RETURNING id;
    `;
    const insertUserResult = await pool.query(insertUserQuery, [username, email, hashPassword]);
    const userId = insertUserResult.rows[0].id;

    console.log('insertResult: ', insertUserResult);

    const payload = { id: userId };
    const token = jwt.sign(payload, process.env.CLIENT_JWT_KEY, { expiresIn: '3d' });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ status: 'failed', message: 'Something went wrong', err });
  }
};
exportObject.login = async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ status: 'fail', message: 'Username and password are required' });
    return;
  }

  try {
    const userQuery = `
        SELECT id, password FROM users
        WHERE username = $1 OR email = $1;
      `;
    const userResult = await pool.query(userQuery, [username]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'User not found' });
    }

    const user = userResult.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(404).json({ status: 'fail', message: 'Wrong password' });
    }

    console.log('user: ', user);
    const payload = { id: user.id };
    const token = jwt.sign(payload, process.env.CLIENT_JWT_KEY, { expiresIn: '3d' });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ status: 'failed', message: 'Something went wrong', err });
  }
};

exportObject.tokenChecker = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const token = req.headers.authorization.split(' ')[1];
    try {
      const jt = await jwt.verify(token, process.env?.CLIENT_JWT_KEY);
      req._userId = jt.id;
      next();
      return;
    } catch (error) {
      res.status(401).json({ status: 'failed', message: 'Unauthorized' });
      return;
    }
  }
  res.status(401).json({ status: 'failed', message: 'Unauthorized' });
};

module.exports = exportObject;

// { "username": "testuser", "password": "password", "email": "test@example.com" }

/*

{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiaWF0IjoxNzUyODk1MjM5LCJleHAiOjE3NTMxNTQ0Mzl9.duh9ntBSaYl8FNbk9wJf7Ys599dx_MQcJcuSQXg86SA"
}

*/
