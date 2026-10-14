# ChatAura Avatar Frame Design Specification
**Technical Guide & Standards for Design & 3D/VFX Teams**

- **Target Systems:** Android App (`ProfileAvatarView`), Admin Panel (`/nextadmin/frames`), Web CDN
- **Last Updated:** October 14, 2026

---

## 1. Golden Rule: Standard Dimensions & Central Hole

To ensure frames render instantly and fit user avatars with **zero manual configuration or code changes**, all standard frames (both **Shop Frames** and **Role Frames**) should be constructed according to this default template:

| Parameter | Standard Value | Description |
| :--- | :--- | :--- |
| **Canvas Size** | `512 × 512 px` | Exact 1:1 square canvas. |
| **Hole Shape** | Perfect Circle | Cutout where the user's circular avatar displays. |
| **Hole Position** | **Dead Center** | Centered horizontally and vertically (`X: 50%`, `Y: 50%`). |
| **Hole Diameter** | **58% of canvas width** | Exactly **`297 px`** on a `512 × 512 px` canvas (ratio: `0.58`). |
| **Hole Fill** | 100% Transparent (`alpha = 0`) | The inner circle must be completely cut out. |
| **Frame Artwork Margin** | Outer ~21% border | Decorative art (wings, gems, borders, glow) occupies the outer rim. |

> **Why 58%?** The client app uses `AVATAR_INNER_SCALE = 0.58f`. When frames follow this ratio, the photo aligns automatically with no cropping or gaps.

---

## 2. Off-Center & Asymmetric Frames (Exceptions)

If an elaborate design cannot be dead-centered (for example: a tall crown on top, a bottom pedestal, or an asymmetrical mythical creature):

1. **This is completely supported.**
2. When submitting the asset, the designer **must specify two values**:
   * **Hole Size (%):** The diameter of the circular hole relative to the 512 px canvas (e.g., `54%` or `62%`).
   * **Hole Position (Move Down / Offset):** How far down (or up) the hole is shifted from the exact center (in pixels or percentage).
3. The Admin will input these exact numbers into the **Admin Panel** under:
   * **Photo Size** (`avatarScale`)
   * **Photo Move Down** (`avatarOffsetY`)
4. The app will automatically shift and scale the avatar to fit the custom frame perfectly.

---

## 3. Supported Formats & Technical Limits

| Asset Type | Supported Formats | Dimensions | Max File Size | Duration & Loop |
| :--- | :--- | :--- | :--- | :--- |
| **Static Frames** | `.png` (32-bit alpha) or `.webp` | `512 × 512 px` | **< 200 KB** | N/A |
| **Animated WebP / Lottie** | Animated `.webp` or Lottie `.json` | `512 × 512 px` | **< 500 KB** | **2 – 4 seconds** (seamless loop) |
| **Video Frames (WebM)** | Transparent `.webm` (VP8/VP9 with alpha channel) | `512 × 512 px` | **< 1 MB** | **2 – 4 seconds** (seamless loop) |
| **Video Frames (MP4)** | `.mp4` (H.264, pure black background `#000000`) | `512 × 512 px` | **< 1 MB** | **2 – 4 seconds** (seamless loop) |

### Notes on Video Formats:
* **MP4 (Screen Blend Mode):** If using MP4, the background must be pure RGB `(0, 0, 0)` black. The app applies a `Screen` blending composite to eliminate the black background and render glowing/sparkling effects over the avatar.
* **WebM (Alpha Channel):** Preferred for crisp opaque borders and complex solid elements requiring transparency.

---

## 4. Mandatory Still Preview Image (Poster)

For **every animated or video frame** (WebP, Lottie, MP4, WebM):
* Designers **must always deliver a matching static preview image** (`.png` or `.webp`, `512 × 512 px`, `< 200 KB`).
* **Why this is required:** 
  1. Displayed in thumbnail grids, store catalogs, and backpack inventory lists to save user data and GPU memory.
  2. Acts as an instantaneous fallback while high-definition video/animation assets stream from the CDN.

---

## 5. Submission Checklist for Designers

Before uploading or handing over a new frame asset:

- [ ] Canvas is exactly `512 × 512 px` (1:1 square).
- [ ] Central hole is a clean circle with 100% transparency (or solid black background for MP4).
- [ ] Hole diameter is **58%** (`297 px`) unless documented as an exception.
- [ ] If off-center: hole diameter and vertical offset are documented in the delivery note.
- [ ] File size is strictly within limits (< 200 KB for static, < 500 KB for animated WebP/Lottie, < 1 MB for video).
- [ ] Animation loops seamlessly within 2 to 4 seconds without jumps or hitches.
- [ ] A matching static preview image (`512 × 512`, < 200 KB) is included with all animated frames.
