const dgram = require("dgram");

// Prebuilt ping packet
const pingBuffer = Buffer.from([-2, 1]);

// Helper: read Mindustry-style string
function readString(buffer) {
  const length = buffer[0] & 0xff;
  const text = buffer.subarray(1, 1 + length).toString("utf8");
  return [text, 1 + length];
}

/**
 * Query a Mindustry server for info
 * @param {string} address - Server IP or domain
 * @param {number} port - Server port (default 6567)
 * @param {number} timeout - Timeout in ms (default 2000)
 * @returns {Promise<object>} Server info
 */
async function getServerInfo(address, port = 6567, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");

    let finished = false;
    const done = (err, result) => {
      if (finished) return;
      finished = true;
      socket.close();
      if (err) reject(err);
      else resolve(result);
    };

    // Set timeout
    socket.once("error", (err) => done(err));
    socket.send(pingBuffer, 0, pingBuffer.length, port, address);

    // Auto-timeout
    const timer = setTimeout(() => {
      done(new Error("Timeout: no response from server"));
    }, timeout);

    socket.on("message", (msg) => {
      clearTimeout(timer);

      try {
        let str, len;

        // host
        [str, len] = readString(msg);
        const host = str;
        msg = msg.subarray(len);

        // map
        [str, len] = readString(msg);
        const map = str;
        msg = msg.subarray(len);

        // players
        const players = msg.readInt32BE(0);
        msg = msg.subarray(4);

        // waves
        const waves = msg.readInt32BE(0);
        msg = msg.subarray(4);

        // version
        const gameversion = msg.readInt32BE(0);
        msg = msg.subarray(4);

        // version type
        [str, len] = readString(msg);
        const vertype = str;
        msg = msg.subarray(len);

        // gamemode byte
        const gamemode = msg[0];
        msg = msg.subarray(1);

        // limit
        const limit = msg.readInt32BE(0);
        msg = msg.subarray(4);

        // description
        [str, len] = readString(msg);
        const desc = str;
        msg = msg.subarray(len);

        // mode name
        [str, len] = readString(msg);
        const modename = str;
        msg = msg.subarray(len);

        const info = {
          host,
          map,
          players,
          waves,
          gameversion,
          vertype,
          gamemode,
          limit,
          desc,
          modename,
        };

        done(null, info);
      } catch (err) {
        done(err);
      }
    });
  });
}

module.exports = { getServerInfo };
