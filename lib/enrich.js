// Turns a raw colatch.com/talent entry {n, ph, cat, meta, tags, star}
// into a matchable profile: field, tier (indicative fee band), audience, face types, known associations.
// The raw list is the source of truth; everything here is derived so new names on the site work automatically.

const FLAGSHIP = new Set([
  "Aamir Khan", "Akshay Kumar", "Alia Bhatt", "Allu Arjun", "Amitabh Bachchan", "Deepika Padukone", "Jr NTR",
  "Kareena Kapoor Khan", "Katrina Kaif", "Ranbir Kapoor", "Ranveer Singh", "Salman Khan", "Shahid Kapoor",
  "Vicky Kaushal", "Ajay Devgn", "Kiara Advani", "Kartik Aaryan", "Ram Charan", "Rashmika Mandanna", "Varun Dhawan",
  "Madhuri Dixit", "Saif Ali Khan", "Sanjay Dutt", "Vijay Deverakonda", "Tiger Shroff", "Janhvi Kapoor",
  "Sara Ali Khan", "Ayushmann Khurrana", "Anil Kapoor", "MS Dhoni", "Virat Kohli", "Rohit Sharma",
  "Sachin Tendulkar", "Hardik Pandya", "Jasprit Bumrah", "Shubman Gill", "Neeraj Chopra", "Diljit Dosanjh",
  "Shreya Ghoshal", "Badshah", "Honey Singh", "Karan Aujla", "AP Dhillon", "Sonu Nigam", "Kapil sharma",
]);

const SCALE = new Set([
  "Kriti Sanon", "KL Rahul", "Sonu Sood", "Malaika Arora", "Rajkummar Rao", "Pankaj Tripathi", "Tamannaah Bhatia",
  "Disha Patani", "Nora Fatehi", "Bhumi pednekar", "Sidharth Malhotra", "Arjun Kapoor", "Sonakshi Sinha", "Tabu",
  "Vidya Balan", "Manoj Bajpayee", "Nawazuddin Siddiqui", "Aditya Roy Kapur", "Tara Sutaria", "Ananya Panday",
  "Mrunal Thakur", "Yami Gautam", "Suniel Shetty", "Bobby Deol", "Jackie Shroff", "Anupam Kher", "Urvashi Rautela",
  "Jacqueline Fernandez", "Sunny leone", "Neha Kakkar", "Bharti Singh", "Ashneer Grover", "Sreeleela", "Nayanthara",
  "Dulquer Salmaan", "Sushmita Sen", "Karan Johar", "Rohit Shetty", "Tripti Dimri", "Siddhant Chaturvedi",
  "Abhishek Bachchan", "Emraan Hashmi", "Riteish Deshmukh", "Shilpa Shetty", "Karisma Kapoor", "Raveena Tandon",
  "Kajjal Agarwal", "Pooja Hegde", "Shehnaaz Gill", "Rahul Dravid", "Sourav Ganguly", "Yuvraj Singh",
  "Suresh Raina", "Shikhar Dhawan", "Smriti Mandhana", "Shreyas Iyer", "Sanju Samson", "Harmanpreet Kaur",
  "P. V. Sindhu", "Mary Kom", "Sania Mirza", "Sunil Chhetri", "Manu Bhaker", "Saina Nehwal", "Jubin Nautiyal",
  "Sunidhi Chauhan", "B.Praak", "Guru Randhawa", "Kailash Kher", "Pritam Chakraborty", "Ranveer Allahbadia",
  "Raj Shamani", "Nikhil Kamath", "Prajakta Koli", "Munawar Faruqui", "Sunil Grover", "Shivangi Joshi",
  "Rubina Dilaik", "Hina Khan", "Milind Soman", "Harbhajan Singh", "Irfan Pathan", "Zaheer Khan", "Anil Kumble",
  "Sunil Gavaskar", "Navjot Singh Sidhu", "Viswanathan Anand", "Abhinav Bindra",
]);

// Known category associations (Colatch campaigns + public endorsements). Used for the conflict check.
const OWNS = {
  "Shahid Kapoor": ["Auto & EV", "Fashion & Apparel"],
  "Kriti Sanon": ["Beauty & Skincare", "Fashion & Apparel"],
  "KL Rahul": ["Fintech & BFSI", "D2C / E-commerce"],
  "Sonu Sood": ["Education", "Health & Wellness", "Real Estate"],
  "Neha Dhupia": ["Health & Wellness"],
  "Malaika Arora": ["Fashion & Apparel", "Beauty & Skincare", "Jewellery & Luxury"],
  "Saina Nehwal": ["Health & Wellness", "Education"],
  "Paresh Rawal": ["Health & Wellness"],
  "Shriya Saran": ["Jewellery & Luxury"],
  "Adah Sharma": ["D2C / E-commerce"],
  "Mouni Roy": ["Beauty & Skincare"],
  "Rakesh Bedi": ["Auto & EV"],
  "Alok Nath": ["Health & Wellness"],
  "Kiku Sharda": ["Fintech & BFSI"],
  "Binda Rawal": ["Jewellery & Luxury"],
  "The great Khali": ["Beauty & Skincare"],
  "Daboo Ratnani": ["Tech / SaaS"],
  "Shivangi Joshi": ["D2C / E-commerce"],
  "Sreeleela": ["Fintech & BFSI"],
};

// Faces with a recent public controversy — kept in the roster, but down-weighted unless the brief accepts bolder bets.
const HIGH_RISK = new Set(["Poonam Pandey", "Munawar Faruqui", "Ranveer Allahbadia", "Hindustani Bhau", "Sunny leone", "Nikki Tamboli", "Sherlyn Chopra", "Rakhi Sawant"]);

const FIELD = { film: "Film", tv: "TV & OTT", cricket: "Cricket", sports: "Sport", singers: "Music", comedy: "Comedy", creators: "Creator", regional: "Regional" };
const BASE_AUD = { film: "Lifestyle", tv: "Family", cricket: "Mass", sports: "Youth", singers: "Youth", comedy: "Youth", creators: "Youth", regional: "Mass" };
const BASE_TYPES = {
  film: ["glam", "lifestyle"], tv: ["trust", "mass"], cricket: ["youth", "mass", "credible", "trust"],
  sports: ["credible", "trust", "youth"], singers: ["youth", "lifestyle"], comedy: ["youth", "mass"],
  creators: ["credible", "youth"], regional: ["mass", "trust"],
};
const DEFAULT_TIER = { film: "Growth", tv: "Starter", cricket: "Growth", sports: "Growth", singers: "Growth", comedy: "Starter", creators: "Starter", regional: "Growth" };

export function parseFollowers(meta) {
  const m = String(meta || "").match(/([\d.]+)\s*([KM])\s*followers/i);
  if (!m) return 0;
  return parseFloat(m[1]) * (m[2].toUpperCase() === "M" ? 1e6 : 1e3);
}

export function slugOf(x) { return x.ph || ""; }

export function enrich(x) {
  const cat = FIELD[x.cat] ? x.cat : "film";
  const tags = (x.tags || []).map(String);
  const tagStr = tags.join(" ").toLowerCase();
  const meta = String(x.meta || "");
  const role = meta.split(" · ")[0];
  const followers = parseFollowers(meta);

  let tier = DEFAULT_TIER[cat];
  if (FLAGSHIP.has(x.n)) tier = "Flagship";
  else if (SCALE.has(x.n)) tier = "Scale";
  else if (followers >= 10e6) tier = "Scale";
  else if (followers >= 1e6 || x.star || /veteran|bollywood lead/i.test(meta)) tier = tier === "Starter" ? "Growth" : tier;

  let aud = BASE_AUD[cat];
  if (/veteran|family|devotional|mythology/.test(tagStr) || /veteran/i.test(meta)) aud = "Family";
  else if (/youth/.test(tagStr)) aud = "Youth";
  else if (/fashion|lifestyle|beauty/.test(tagStr)) aud = "Lifestyle";
  if (tier === "Flagship" && cat === "film") aud = "Premium";

  const types = new Set(BASE_TYPES[cat]);
  if (/veteran/.test(tagStr) || /veteran/i.test(meta)) { types.add("trust"); types.add("credible"); }
  if (/fashion|beauty|lifestyle/.test(tagStr)) types.add("glam");
  if (/fitness|sport/.test(tagStr)) { types.add("credible"); types.add("youth"); }
  if (/business|podcast|speaker|social impact/.test(tagStr) || /entrepreneur|author|podcaster/i.test(meta)) types.add("credible");
  if (/devotional|mythology|family/.test(tagStr)) types.add("trust");
  if (/youth|digital|dance/.test(tagStr)) types.add("youth");
  if (tier === "Flagship") types.add("premium");
  if (tier === "Flagship" || tier === "Scale") types.add("mass");

  const langs = [];
  if (/punjabi|haryanvi/.test(tagStr) || /punjabi|haryanvi/i.test(meta)) langs.push("north");
  if (/bhojpuri/i.test(meta + tagStr)) langs.push("bhojpuri");
  if (/marathi/i.test(meta + tagStr)) langs.push("marathi");
  if (/bengali/i.test(meta + tagStr)) langs.push("bengali");
  if (/telugu|tamil|malayalam|kannada|south/i.test(meta + tagStr)) langs.push("south");
  if (/gujarati/i.test(meta + tagStr)) langs.push("gujarati");

  return {
    n: x.n, ph: x.ph || "", cat, field: cat === "sports" && /star$/i.test(role) ? role.replace(/\s*star$/i, "") : FIELD[cat],
    role, vibe: role, tags, star: !!x.star, followers, tier, aud, types: [...types],
    owns: OWNS[x.n] || [], langs, risky: HIGH_RISK.has(x.n),
  };
}
