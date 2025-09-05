const express = require('express');
const app = express();
const port = 8080;

app.get('/', (req, res) => {
  res.send('<h1>Hello, World!</h1>');
});

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
