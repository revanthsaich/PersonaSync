import { io as ioClient } from "socket.io-client";

console.log("🧪 Starting WebSocket test...\n");

// Test User 1
const socket1 = ioClient("http://localhost:4000", {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

socket1.on("connect", () => {
  console.log("✅ User 1 connected. Registering...");
  socket1.emit("register", "user1@test.com");
});

socket1.on("registered", (data) => {
  console.log(`✅ User 1 registered as: ${data.email}`);
});

socket1.on("invite:received", (data) => {
  console.log(`📨 User 1 received invite:`, data);
});

// Test User 2
setTimeout(() => {
  const socket2 = ioClient("http://localhost:4000", {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket2.on("connect", () => {
    console.log("\n✅ User 2 connected. Registering...");
    socket2.emit("register", "user2@test.com");
  });

  socket2.on("registered", (data) => {
    console.log(`✅ User 2 registered as: ${data.email}\n`);
  });

  // Simulate sending an invite from User 2 to User 1
  setTimeout(() => {
    console.log("📤 User 2 sending invite to user1@test.com...\n");
    socket2.emit("test-invite", {
      from: "user2@test.com",
      to: "user1@test.com",
    });
  }, 1000);
}, 1000);

// Keep the script running
setTimeout(() => {
  console.log("\n❌ Test timeout. Exiting...");
  socket1.disconnect();
  process.exit(0);
}, 10000);
