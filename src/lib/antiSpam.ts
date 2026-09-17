const userMessages = new Map<string, {
  message: string;
  count: number;
  lastMessageTime: number;
}>();

const TIME_LIMIT_MS = 5000; // 5 detik
const MAX_REPEATED = 3;

// Cek apakah pesan sama dikirim berulang kali dalam waktu singkat
function isSpamMessage(sender: string, message: string): boolean {
  const currentTime = Date.now();

  if (!userMessages.has(sender)) {
    userMessages.set(sender, { message, count: 1, lastMessageTime: currentTime });
    return false;
  }

  const userData = userMessages.get(sender)!;

  if (userData.message === message && (currentTime - userData.lastMessageTime) < TIME_LIMIT_MS) {
    userData.count += 1;
    userData.lastMessageTime = currentTime;

    if (userData.count >= MAX_REPEATED) {
      return true;
    }
  } else {
    userMessages.set(sender, { message, count: 1, lastMessageTime: currentTime });
  }

  return false;
}

// Deteksi karakter acak (misal spam huruf panjang)
function isRandomCharacters(message: string): boolean {
  const pattern = /^[a-zA-Z]{10,}$/; // huruf doang dan panjang >=10
  return pattern.test(message);
}

// Fungsi utama
export function preventSpam(sender: string, message: string): boolean {
  if (isSpamMessage(sender, message) || isRandomCharacters(message)) {
    console.log("🚫 Spam detected — stats will not be updated.");
    return true;
  }
  return false;
}
