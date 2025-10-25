// Firebase-based auth wrapper (ES module, Firebase v9 modular SDK)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAV31IONxIXVSpXOhcZDOw4WTiclO8GC4g",
  authDomain: "fir-4companion.firebaseapp.com",
  projectId: "fir-4companion",
  storageBucket: "fir-4companion.firebasestorage.app",
  messagingSenderId: "753084648743",
  appId: "1:753084648743:web:641f84f8d78a498abe6d02",
  measurementId: "G-67W9N0E3ZH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Helper: map firebase errors to friendly messages
function friendlyError(err) {
  if (!err || !err.code) return { message: err?.message || "Unknown error" };
  const code = err.code;
  if (code === "auth/email-already-in-use") return { message: "Email already registered" };
  if (code === "auth/invalid-email") return { message: "Invalid email address" };
  if (code === "auth/weak-password") return { message: "Password is too weak (min 6 chars)" };
  if (code === "auth/user-not-found") return { message: "No account found for this email" };
  if (code === "auth/wrong-password") return { message: "Incorrect password" };
  return { message: err.message || code };
}

// Public API
async function signup({ name, email, password }) {
  if (!name || !email || !password) throw new Error("All fields are required");
    const strongPassword =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;"'<>,.?~\\/-]).{8,}$/;

  if (!strongPassword.test(password)) {
    throw new Error("Password must be at least 8 characters and include uppercase, lowercase, number, and special character");
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    // Store display name
    if (user) {
      try {
        await updateProfile(user, { displayName: name });
      } catch (e) {
        console.warn("Profile update failed:", e);
      }

      // 👇 Send verification email
      await sendEmailVerification(user);

      // 👇 Sign out user right after sending verification
      await signOut(auth);

      // 👇 Tell the UI what happened
      // alert(`Verification email sent to ${email}. Please verify before signing in.`);
    }

    return mapUser(user);
  } catch (err) {
    throw new Error(friendlyError(err).message);
  }
}


async function login({ email, password }) {
  if (!email || !password) throw new Error("Email and password required");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    // 👇 Check if verified
    if (!user.emailVerified) {
      await signOut(auth);
      throw new Error("Please verify your email before signing in.");
    }

    return mapUser(user);
  } catch (err) {
    throw new Error(friendlyError(err).message);
  }
}


async function logout() {
  try {
    await signOut(auth);
  } catch (err) {
    // ignore sign-out errors for now
    console.warn("Sign out failed:", err);
  }
}

function currentUser() {
  const u = auth.currentUser;
  return mapUser(u);
}

function requireAuth() {
  const u = currentUser();
  if (!u) throw new Error("Not authenticated");
  return u;
}

function mapUser(firebaseUser) {
  if (!firebaseUser) return null;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: firebaseUser.displayName || null,
    emailVerified: firebaseUser.emailVerified || false,
    providerId: (firebaseUser.providerData && firebaseUser.providerData[0] && firebaseUser.providerData[0].providerId) || null
  };
}

window.CCAuth = {
  signup,
  login,
  logout,
  currentUser,
  requireAuth
};

// Update UI in Home.html when auth state changes
function updateAuthUI() {
  try {
    const authArea = document.getElementById("authArea");
    if (!authArea) return;
    authArea.innerHTML = "";
    const u = currentUser();
    if (u) {
      const nameSpan = document.createElement("span");
      nameSpan.textContent = u.name || u.email || "User";
      if (u.email === "aroraganesh2007@gmail.com") {
        const adminTag = document.createElement("span");
        adminTag.textContent = " (Admin)";
        adminTag.style.color = "#2563eb";
        nameSpan.appendChild(adminTag);
      }
      nameSpan.style.fontWeight = "600";
      nameSpan.style.color = "#0f172a";
      authArea.appendChild(nameSpan);

      const btn = document.createElement("button");
      btn.textContent = "Logout";
      btn.style.marginLeft = "8px";
      btn.onclick = async () => {
        try {
          // attempt logout
          await logout();
        } catch (err) {
          console.warn('Logout failed:', err);
          // still navigate away so user leaves the app state
        }
        // redirect user to index.html after logout (same-tab)
        window.location.href = 'index.html';
      };
      authArea.appendChild(btn);
    } else {
      const a = document.createElement("a");
      a.id = "authBtn";
      a.href = "index.html";
      a.textContent = "Login / Signup";
      authArea.appendChild(a);
    }
  } catch (e) {
    // ignore on non-index pages
    console.warn("updateAuthUI:", e);
  }
}

// listen for authentication state changes and refresh UI
onAuthStateChanged(auth, (fbUser) => {
  // fbUser is null when signed out; mapUser converts it accordingly
  updateAuthUI();
});

// initial UI update (in case script runs after DOM loaded)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateAuthUI);
} else {
  updateAuthUI();

}



