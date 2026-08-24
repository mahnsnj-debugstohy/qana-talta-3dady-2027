const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "qana-2027-change-secret";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function defaultDB() {
  return {
    users: [],
    subjects: [
      {id:"arabic", name:"اللغة العربية", icon:"📖", description:"النحو والقراءة والنصوص والتعبير"},
      {id:"math", name:"الرياضيات", icon:"📐", description:"الجبر والهندسة والحساب"},
      {id:"science", name:"العلوم", icon:"🔬", description:"شرح مبسط وتجارب وأسئلة"},
      {id:"english", name:"اللغة الإنجليزية", icon:"🇬🇧", description:"Grammar وVocabulary وReading"},
      {id:"social", name:"الدراسات الاجتماعية", icon:"🌍", description:"التاريخ والجغرافيا"},
    ],
    lessons: [
      {id:"welcome", subjectId:"arabic", unit:"مقدمة", title:"مرحباً بكم في المنصة", description:"شرح تجريبي يمكنك حذفه من لوحة الأدمن", youtubeUrl:"https://www.youtube.com/watch?v=dQw4w9WgXcQ", published:true, createdAt:new Date().toISOString()}
    ],
    quizzes: [],
    attempts: [],
    announcements: [
      {id:"a1", title:"أهلاً بكم في قناة دفعة تالتة إعدادي 2027 🎓", body:"ابدأ أول درس وشارك في التحديات اليومية!", createdAt:new Date().toISOString(), published:true}
    ],
    certificates: [],
    counters: {user:1, lesson:2, quiz:1, question:1, announcement:2, certificate:1}
  };
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const db = defaultDB();
    saveDB(db);
    return db;
  }
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { const db = defaultDB(); saveDB(db); return db; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8"); }
let db = loadDB();

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, "public")));

function tokenFor(user) {
  return jwt.sign({id:user.id, role:user.role}, JWT_SECRET, {expiresIn:"7d"});
}
function auth(req,res,next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({error:"يجب تسجيل الدخول"});
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"جلسة الدخول انتهت"}); }
}
function admin(req,res,next) {
  auth(req,res,()=> {
    if (req.user.role !== "admin") return res.status(403).json({error:"غير مسموح"});
    next();
  });
}
function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}
function youtubeEmbed(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return "https://www.youtube.com/embed/" + u.pathname.slice(1).split("/")[0];
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return "https://www.youtube.com/embed/" + (u.searchParams.get("v") || "");
      if (u.pathname.startsWith("/shorts/")) return "https://www.youtube.com/embed/" + u.pathname.split("/")[2];
      if (u.pathname.startsWith("/embed/")) return url;
    }
  } catch {}
  return "";
}

app.post("/api/auth/register", async (req,res)=>{
  const {name, phone, password} = req.body;
  if (!name || !phone || !password || password.length < 4) return res.status(400).json({error:"أدخل الاسم ورقم الهاتف وكلمة مرور 4 أحرف على الأقل"});
  if (db.users.some(u=>u.phone===phone)) return res.status(409).json({error:"رقم الهاتف مسجل بالفعل"});
  const user = {id:uid("u_"), name, phone, password:await bcrypt.hash(password,10), role:"student", xp:0, createdAt:new Date().toISOString()};
  db.users.push(user); saveDB(db);
  res.json({token:tokenFor(user), user:{id:user.id,name:user.name,phone:user.phone,role:user.role,xp:user.xp}});
});

app.post("/api/auth/login", async (req,res)=>{
  const {identifier,password} = req.body;
  if (identifier===ADMIN_USERNAME && password===ADMIN_PASSWORD) {
    const adminUser = {id:"admin",name:"محمد",role:"admin"};
    return res.json({token:tokenFor(adminUser), user:adminUser});
  }
  const user = db.users.find(u=>u.phone===identifier);
  if (!user || !(await bcrypt.compare(password,user.password))) return res.status(401).json({error:"بيانات الدخول غير صحيحة"});
  res.json({token:tokenFor(user), user:{id:user.id,name:user.name,phone:user.phone,role:user.role,xp:user.xp}});
});

app.get("/api/me", auth, (req,res)=>{
  if(req.user.role==="admin") return res.json({id:"admin",name:"محمد",role:"admin"});
  const u=db.users.find(x=>x.id===req.user.id);
  if(!u) return res.status(404).json({error:"الحساب غير موجود"});
  res.json({id:u.id,name:u.name,phone:u.phone,role:u.role,xp:u.xp});
});

app.get("/api/public", (req,res)=>{
  res.json({
    subjects:db.subjects,
    lessons:db.lessons.filter(x=>x.published).map(x=>({...x,embedUrl:youtubeEmbed(x.youtubeUrl)})),
    quizzes:db.quizzes.filter(x=>x.published).map(x=>({id:x.id,subjectId:x.subjectId,title:x.title,description:x.description,minutes:x.minutes,questionCount:x.questions.length})),
    announcements:db.announcements.filter(x=>x.published).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  });
});

app.get("/api/quizzes/:id", auth, (req,res)=>{
  const q=db.quizzes.find(x=>x.id===req.params.id && x.published);
  if(!q) return res.status(404).json({error:"الاختبار غير موجود"});
  res.json({...q, questions:q.questions.map(x=>({id:x.id,text:x.text,options:x.options}))});
});

app.post("/api/quizzes/:id/submit", auth, (req,res)=>{
  const q=db.quizzes.find(x=>x.id===req.params.id && x.published);
  if(!q) return res.status(404).json({error:"الاختبار غير موجود"});
  const answers=req.body.answers||{};
  let correct=0;
  q.questions.forEach(x=>{if(answers[x.id]===x.answer) correct++;});
  const score=q.questions.length ? Math.round((correct/q.questions.length)*100) : 0;
  const earned=Math.max(5, correct*10);
  const attempt={id:uid("at_"),userId:req.user.id,quizId:q.id,correct,score,earned,createdAt:new Date().toISOString()};
  db.attempts.push(attempt);
  const u=db.users.find(x=>x.id===req.user.id);
  if(u){u.xp=(u.xp||0)+earned;}
  saveDB(db);
  res.json({correct,total:q.questions.length,score,earned,xp:u?.xp||0});
});

app.get("/api/progress", auth, (req,res)=>{
  const attempts=db.attempts.filter(a=>a.userId===req.user.id);
  const u=db.users.find(x=>x.id===req.user.id);
  const xp=u?.xp||0;
  const level=Math.floor(xp/100)+1;
  const certificates=db.certificates.filter(c=>c.userId===req.user.id);
  res.json({xp,level,nextLevel:level*100,attempts,certificates});
});

/* Admin */
app.get("/api/admin/dashboard", admin, (req,res)=>{
  res.json({
    users:db.users.length, lessons:db.lessons.length, quizzes:db.quizzes.length,
    attempts:db.attempts.length, announcements:db.announcements.length,
    subjects:db.subjects.length
  });
});
app.get("/api/admin/data", admin, (req,res)=>{
  res.json({subjects:db.subjects,lessons:db.lessons,quizzes:db.quizzes,announcements:db.announcements,users:db.users.map(u=>({id:u.id,name:u.name,phone:u.phone,xp:u.xp,createdAt:u.createdAt}))});
});
app.post("/api/admin/subjects", admin, (req,res)=>{
  const {name,icon="📚",description=""}=req.body;
  if(!name) return res.status(400).json({error:"اسم المادة مطلوب"});
  const s={id:uid("s_"),name,icon,description}; db.subjects.push(s); saveDB(db); res.json(s);
});
app.delete("/api/admin/subjects/:id", admin, (req,res)=>{
  db.subjects=db.subjects.filter(x=>x.id!==req.params.id); saveDB(db); res.json({ok:true});
});
app.post("/api/admin/lessons", admin, (req,res)=>{
  const {subjectId,unit,title,description="",youtubeUrl,published=true}=req.body;
  const embed= youtubeEmbed(youtubeUrl);
  if(!subjectId||!title||!youtubeUrl||!embed) return res.status(400).json({error:"أدخل المادة والعنوان ورابط YouTube صحيح"});
  const lesson={id:uid("l_"),subjectId,unit:unit||"الوحدة الأولى",title,description,youtubeUrl,embedUrl:embed,published:!!published,createdAt:new Date().toISOString()};
  db.lessons.push(lesson); saveDB(db); res.json(lesson);
});
app.put("/api/admin/lessons/:id", admin, (req,res)=>{
  const l=db.lessons.find(x=>x.id===req.params.id); if(!l)return res.status(404).json({error:"الدرس غير موجود"});
  Object.assign(l,req.body);
  if(req.body.youtubeUrl){const e=youtubeEmbed(req.body.youtubeUrl); if(!e)return res.status(400).json({error:"رابط YouTube غير صحيح"}); l.embedUrl=e;}
  saveDB(db); res.json(l);
});
app.delete("/api/admin/lessons/:id", admin, (req,res)=>{db.lessons=db.lessons.filter(x=>x.id!==req.params.id);saveDB(db);res.json({ok:true});});

app.post("/api/admin/quizzes", admin, (req,res)=>{
  const {subjectId,title,description="",minutes=15,questions=[]}=req.body;
  if(!subjectId||!title||!questions.length)return res.status(400).json({error:"أدخل المادة والعنوان وسؤالاً واحداً على الأقل"});
  const qs=questions.map(x=>({id:uid("q_"),text:x.text,options:x.options,answer:Number(x.answer)}));
  const q={id:uid("quiz_"),subjectId,title,description,minutes:Number(minutes),questions:qs,published:true,createdAt:new Date().toISOString()};
  db.quizzes.push(q);saveDB(db);res.json(q);
});
app.delete("/api/admin/quizzes/:id", admin, (req,res)=>{db.quizzes=db.quizzes.filter(x=>x.id!==req.params.id);saveDB(db);res.json({ok:true});});

app.post("/api/admin/announcements", admin, (req,res)=>{
  const {title,body,published=true}=req.body;
  if(!title||!body)return res.status(400).json({error:"العنوان والمحتوى مطلوبان"});
  const a={id:uid("a_"),title,body,published:!!published,createdAt:new Date().toISOString()};
  db.announcements.push(a);saveDB(db);res.json(a);
});
app.delete("/api/admin/announcements/:id", admin, (req,res)=>{db.announcements=db.announcements.filter(x=>x.id!==req.params.id);saveDB(db);res.json({ok:true});});

app.post("/api/admin/certificate", admin, (req,res)=>{
  const {userId,title="شهادة تقدير",reason="التفوق والتميز"}=req.body;
  const u=db.users.find(x=>x.id===userId); if(!u)return res.status(404).json({error:"الطالب غير موجود"});
  const c={id:uid("cert_"),userId,title,reason,studentName:u.name,createdAt:new Date().toISOString()};
  db.certificates.push(c);saveDB(db);res.json(c);
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`\n🎓 Qana 3dady 2027 running: http://127.0.0.1:${PORT}\n`));
