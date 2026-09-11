// netlify/functions/generate-quiz.js
//
// Endpoint: POST /.netlify/functions/generate-quiz
// Body: { text: string, numMcq: number, numEssay: number, difficulty: string }
//
// Pakai Google Gemini API (gratis lewat Google AI Studio, tanpa kartu kredit).
// Fitur "self-healing": kalau output AI tidak valid (JSON rusak, jumlah soal
// tidak sesuai, opsi kurang, dll), function ini otomatis mengirim balik
// kesalahan tersebut ke AI dan meminta perbaikan, sampai maksimal 3 percobaan,
// sebelum akhirnya melaporkan error yang jelas ke frontend.

const MAX_ATTEMPTS = 3;
const MODEL = "gemini-2.5-flash";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respond(500, {
      error:
        "Server belum dikonfigurasi: environment variable GEMINI_API_KEY belum diset di Netlify.",
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return respond(400, { error: "Body request tidak valid." });
  }

  const rawText = typeof payload.text === "string" ? payload.text : "";
  if (!rawText.trim()) {
    return respond(400, { error: "Materi pelajaran kosong." });
  }

  const numMcq = clampInt(payload.numMcq, 0, 15, 5);
  const numEssay = clampInt(payload.numEssay, 0, 10, 3);
  const difficulty = ["mudah", "sedang", "sulit", "campuran"].includes(
    payload.difficulty
  )
    ? payload.difficulty
    : "sedang";

  if (numMcq === 0 && numEssay === 0) {
    return respond(400, {
      error: "Jumlah soal pilihan ganda dan essay tidak boleh dua-duanya 0.",
    });
  }

  const materi = rawText.length > 24000 ? rawText.slice(0, 24000) : rawText;
  const systemPrompt = buildSystemPrompt(numMcq, numEssay, difficulty);

  let lastError = "Tidak diketahui.";
  let lastRawOutput = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const userMessage =
      attempt === 1
        ? `Materi pelajaran:\n\n${materi}`
        : `Materi pelajaran:\n\n${materi}\n\n---\nPercobaan sebelumnya GAGAL. Ini output sebelumnya (mungkin terpotong):\n${lastRawOutput.slice(
            0,
            3000
          )}\n\nMasalah yang terdeteksi: ${lastError}\n\nPerbaiki masalah tersebut dan kembalikan HANYA satu JSON valid yang lengkap dan sesuai semua ketentuan di atas.`;

    try {
      const apiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              temperature: 0.7,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!apiResp.ok) {
        const errBody = await apiResp.text();
        lastError = `Gemini API error ${apiResp.status}: ${errBody.slice(0, 300)}`;
        lastRawOutput = "";
        continue;
      }

      const data = await apiResp.json();
      const candidate = data.candidates && data.candidates[0];
      const textOut =
        candidate && candidate.content && candidate.content.parts
          ? candidate.content.parts.map((p) => p.text || "").join("\n")
          : "";

      if (!textOut) {
        lastError =
          "Respons Gemini kosong (kemungkinan diblokir oleh filter keamanan atau materi terlalu panjang).";
        lastRawOutput = JSON.stringify(data).slice(0, 1000);
        continue;
      }

      lastRawOutput = textOut;

      const parsed = tryParseJson(textOut);
      const validation = validateQuiz(parsed, numMcq, numEssay);

      if (validation.ok) {
        return respond(200, { quiz: validation.quiz, attempts: attempt });
      }
      lastError = validation.error;
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
    }
  }

  return respond(502, {
    error: `Gagal menyusun soal yang valid setelah ${MAX_ATTEMPTS} percobaan otomatis (${lastError}). Coba kurangi jumlah soal atau gunakan materi yang lebih ringkas.`,
  });
};

function respond(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  };
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildSystemPrompt(numMcq, numEssay, difficulty) {
  return `Kamu adalah pembuat soal untuk guru. Berdasarkan materi pelajaran yang diberikan, buat soal latihan.
Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown code fence, dengan struktur persis seperti ini:
{
  "topic": "judul singkat materi",
  "mcq": [
    { "question": "teks soal", "options": ["opsi A", "opsi B", "opsi C", "opsi D"], "correct_index": 0, "explanation": "penjelasan singkat kenapa itu jawaban benar" }
  ],
  "essay": [
    { "question": "teks soal essay", "model_answer": "contoh jawaban model yang ringkas" }
  ]
}
Ketentuan wajib:
- Array "mcq" harus berisi TEPAT ${numMcq} soal, dan array "essay" harus berisi TEPAT ${numEssay} soal. Jika salah satu angka itu 0, kembalikan array kosong ([]) untuk bagian itu, jangan dihilangkan dari JSON.
- Tingkat kesulitan soal: ${
    difficulty === "campuran" ? "campuran mudah, sedang, dan sulit" : difficulty
  }.
- Setiap soal pilihan ganda punya TEPAT 4 opsi (array "options" panjang 4), hanya satu yang benar, dan "correct_index" adalah angka 0-3 sesuai posisi opsi yang benar.
- Soal harus berdasarkan isi materi yang diberikan, bukan pengetahuan umum di luar materi.
- Gunakan bahasa Indonesia yang jelas dan sesuai jenjang materi.
- Jangan menomori soal secara manual di dalam teks "question".
- Balasanmu HARUS bisa langsung diproses oleh JSON.parse tanpa perbaikan apa pun: tidak ada teks pembuka, penutup, atau markdown fence.`;
}

function tryParseJson(rawText) {
  const clean = (rawText || "")
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

function validateQuiz(parsed, expectedMcq, expectedEssay) {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Output tidak bisa dibaca sebagai JSON." };
  }
  const mcq = Array.isArray(parsed.mcq) ? parsed.mcq : null;
  const essay = Array.isArray(parsed.essay) ? parsed.essay : null;

  if (!mcq) return { ok: false, error: '"mcq" hilang atau bukan array.' };
  if (!essay) return { ok: false, error: '"essay" hilang atau bukan array.' };

  if (mcq.length !== expectedMcq) {
    return {
      ok: false,
      error: `Jumlah soal pilihan ganda ada ${mcq.length}, seharusnya ${expectedMcq}.`,
    };
  }
  if (essay.length !== expectedEssay) {
    return {
      ok: false,
      error: `Jumlah soal essay ada ${essay.length}, seharusnya ${expectedEssay}.`,
    };
  }

  for (let i = 0; i < mcq.length; i++) {
    const q = mcq[i];
    if (!q || typeof q.question !== "string" || !q.question.trim()) {
      return { ok: false, error: `Soal PG nomor ${i + 1} tidak punya teks pertanyaan yang valid.` };
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return { ok: false, error: `Soal PG nomor ${i + 1} tidak punya tepat 4 opsi.` };
    }
    if (
      typeof q.correct_index !== "number" ||
      q.correct_index < 0 ||
      q.correct_index > 3 ||
      !Number.isInteger(q.correct_index)
    ) {
      return { ok: false, error: `Soal PG nomor ${i + 1} punya correct_index yang tidak valid.` };
    }
  }

  for (let i = 0; i < essay.length; i++) {
    const q = essay[i];
    if (!q || typeof q.question !== "string" || !q.question.trim()) {
      return { ok: false, error: `Soal essay nomor ${i + 1} tidak punya teks pertanyaan yang valid.` };
    }
  }

  return {
    ok: true,
    quiz: {
      topic: typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic : "Soal latihan",
      mcq,
      essay,
    },
  };
}
