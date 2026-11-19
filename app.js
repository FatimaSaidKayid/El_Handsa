(() => {
  const cfg = window.EL_HANDSA_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
  const $ = (id) => document.getElementById(id);
  let supabase = null, role = "student", currentUser = null, selectedGrade = "all", lessons = [];
  const gradeNames = {"1":"الأول الثانوي","2":"الثاني الثانوي","3":"الثالث الثانوي"};
  $("year").textContent = new Date().getFullYear();

  if (configured && window.supabase) {
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    supabase.auth.getSession().then(({data}) => { if (data.session) acceptSession(data.session); });
  } else {
    showMessage("للبدء: أضيفي بيانات Supabase في ملف config.js ثم نفذي خطوات README.", false);
  }

  function showMessage(message, success=false) {
    const el=$("auth-message"); el.textContent=message; el.classList.toggle("success",success);
  }
  function toast(message) {
    const el=$("toast"); el.textContent=message; el.classList.add("show");
    setTimeout(()=>el.classList.remove("show"),2800);
  }
  document.querySelectorAll(".role-btn").forEach(btn => btn.addEventListener("click",()=>{
    role=btn.dataset.role;
    document.querySelectorAll(".role-btn").forEach(b=>b.classList.toggle("active",b===btn));
    $("student-signup").classList.toggle("hidden",role!=="student");
    $("login-submit").innerHTML=role==="teacher"?"دخول المعلم <span>←</span>":"تسجيل الدخول <span>←</span>";
    showMessage(role==="teacher"?"دخول المعلم متاح للبريد الإلكتروني المعتمد فقط.":"");
  }));
  $("toggle-password").addEventListener("click",()=>{
    const p=$("password"); p.type=p.type==="password"?"text":"password";
  });
  $("signup-btn").addEventListener("click", async()=>{
    if(!supabase){showMessage("أكملي إعداد Supabase أولاً.");return;}
    const email=$("email").value.trim(), password=$("password").value;
    if(!email||password.length<8){showMessage("أدخلي البريد وكلمة مرور من 8 أحرف على الأقل.");return;}
    const {error}=await supabase.auth.signUp({email,password});
    if(error) showMessage(error.message);
    else showMessage("تم إنشاء الحساب. راجعي بريدك لتأكيد الحساب إذا كان التأكيد مفعلاً.",true);
  });
  $("login-form").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!supabase){showMessage("المنصة تحتاج إعداد Supabase أولاً. راجعي ملف README.");return;}
    const email=$("email").value.trim(), password=$("password").value;
    $("login-submit").disabled=true; $("login-submit").textContent="جارٍ التحقق...";
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    $("login-submit").disabled=false;
    $("login-submit").innerHTML=role==="teacher"?"دخول المعلم <span>←</span>":"تسجيل الدخول <span>←</span>";
    if(error){showMessage("تعذر تسجيل الدخول. تأكدي من البريد وكلمة المرور.");return;}
    const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",data.user.id).single();
    if(profileError){await supabase.auth.signOut();showMessage("لم يتم إعداد ملف الحساب بعد. تواصلي مع إدارة المنصة.");return;}
    if(role==="teacher" && profile.role!=="teacher"){await supabase.auth.signOut();showMessage("هذا البريد غير معتمد كحساب معلم.");return;}
    if(role==="student" && profile.role==="teacher"){await supabase.auth.signOut();showMessage("اختاري تسجيل دخول المعلم لهذا الحساب.");return;}
    acceptSession(data.session,profile.role);
  });
  async function acceptSession(session, knownRole) {
    currentUser=session.user;
    let accountRole=knownRole;
    if(!accountRole){
      const {data}=await supabase.from("profiles").select("role").eq("id",currentUser.id).single();
      accountRole=data?.role||"student";
    }
    currentUser.role=accountRole;
    $("auth-screen").classList.add("hidden"); $("dashboard-screen").classList.remove("hidden");
    $("side-user-name").textContent=currentUser.email.split("@")[0];
    $("side-user-role").textContent=accountRole==="teacher"?"معلم":"طالب";
    $("top-user-role").textContent=accountRole==="teacher"?"وضع المعلم":"وضع الطالب";
    $("welcome-title").textContent=accountRole==="teacher"?"مرحباً بك في لوحة المعلم":"أهلاً بك في عالم الرياضيات";
    document.querySelectorAll(".teacher-only").forEach(x=>x.classList.toggle("hidden",accountRole!=="teacher"));
    await loadLessons();
  }
  $("logout-btn").addEventListener("click",async()=>{if(supabase)await supabase.auth.signOut();currentUser=null;$("dashboard-screen").classList.add("hidden");$("auth-screen").classList.remove("hidden");$("password").value="";});
  document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>{
    const upload=btn.dataset.view==="upload";
    $("library-view").classList.toggle("hidden",upload);$("upload-view").classList.toggle("hidden",!upload);
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===btn));
    $("breadcrumb").textContent=upload?"رفع فيديو جديد":"المكتبة التعليمية";
  }));
  async function loadLessons(){
    const {data,error}=await supabase.from("lessons").select("*").order("created_at",{ascending:false});
    if(error){renderEmpty("حدث خطأ أثناء تحميل الدروس.");return;}
    lessons=data||[]; renderLessons();
  }
  function renderEmpty(message){
    $("video-grid").innerHTML=`<div class="empty-state"><div class="empty-icon">∑</div><h3>${escapeHtml(message)}</h3><p>ستظهر الدروس هنا بعد نشرها.</p></div>`;
  }
  function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function renderLessons(){
    const term=$("search-input").value.trim().toLowerCase();
    const shown=lessons.filter(x=>(selectedGrade==="all"||String(x.grade)===selectedGrade)&&(`${x.title} ${x.description||""}`).toLowerCase().includes(term));
    $("video-count").textContent=`${lessons.length} فيديو`;
    if(!shown.length){renderEmpty(lessons.length?"لا توجد دروس مطابقة للبحث.":"لا توجد فيديوهات حتى الآن.");return;}
    $("video-grid").innerHTML=shown.map(x=>`<article class="video-card"><div class="video-thumb"><button class="play-button" data-play="${x.id}" aria-label="مشاهدة الفيديو">▶</button></div><div class="video-card-body"><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description||"شرح من منصة El Handsa التعليمية")}</p><div class="video-meta"><span>${gradeNames[x.grade]||"المرحلة الثانوية"}</span>${currentUser?.role==="teacher"?`<button class="delete-video" data-delete="${x.id}">حذف الدرس</button>`:""}</div></div></article>`).join("");
    document.querySelectorAll("[data-play]").forEach(b=>b.addEventListener("click",()=>openLesson(lessons.find(x=>x.id===b.dataset.play))));
    document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteLesson(b.dataset.delete)));
  }
  document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{
    selectedGrade=b.dataset.grade;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b));renderLessons();
  }));
  $("search-input").addEventListener("input",renderLessons);
  async function openLesson(lesson){
    if(!lesson)return;
    const {data}=supabase.storage.from("lesson-videos").getPublicUrl(lesson.storage_path);
    $("lesson-player").src=data.publicUrl;$("modal-title").textContent=lesson.title;
    $("modal-description").textContent=lesson.description||"";
    $("modal-grade").textContent=gradeNames[lesson.grade]||"";
    $("video-modal").classList.remove("hidden");$("lesson-player").play().catch(()=>{});
  }
  function closeModal(){$("lesson-player").pause();$("lesson-player").removeAttribute("src");$("lesson-player").load();$("video-modal").classList.add("hidden");}
  $("close-modal").addEventListener("click",closeModal);$("modal-backdrop").addEventListener("click",closeModal);
  $("video-file").addEventListener("change",()=>{$("file-name").textContent=$("video-file").files[0]?.name||"لم يتم اختيار ملف بعد";});
  $("upload-form").addEventListener("submit",async e=>{
    e.preventDefault();
    if(currentUser?.role!=="teacher"){toast("هذه الخاصية متاحة للمعلم فقط.");return;}
    const file=$("video-file").files[0], title=$("lesson-title").value.trim(), grade=$("lesson-grade").value;
    if(!file||!title||!grade)return;
    if(!file.type.startsWith("video/")){toast("اختاري ملف فيديو صالحاً.");return;}
    if(file.size>100*1024*1024){toast("حجم الملف أكبر من 100 ميجابايت. قللي حجمه أو ارفعيه على أجزاء.");return;}
    const ext=(file.name.split(".").pop()||"mp4").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
    const path=`${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    $("upload-submit").disabled=true;$("upload-submit").textContent="جارٍ الرفع...";
    $("progress-track").classList.remove("hidden");$("progress-bar").style.width="15%";
    const {error:uploadError}=await supabase.storage.from("lesson-videos").upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError){toast("فشل رفع الفيديو: "+uploadError.message);resetUpload();return;}
    $("progress-bar").style.width="75%";
    const {error:dbError}=await supabase.from("lessons").insert({title,grade:Number(grade),description:$("lesson-description").value.trim(),storage_path:path,created_by:currentUser.id});
    if(dbError){await supabase.storage.from("lesson-videos").remove([path]);toast("تم رفع الملف لكن تعذر حفظ بيانات الدرس.");resetUpload();return;}
    $("progress-bar").style.width="100%";$("upload-form").reset();$("file-name").textContent="لم يتم اختيار ملف بعد";
    toast("تم نشر الدرس بنجاح.");await loadLessons();resetUpload();
    document.querySelector('[data-view="library"]').click();
  });
  function resetUpload(){$("upload-submit").disabled=false;$("upload-submit").innerHTML='نشر الدرس <span>↑</span>';$("progress-track").classList.add("hidden");$("progress-bar").style.width="0";}
  async function deleteLesson(id){
    if(!confirm("هل أنت متأكد من حذف هذا الدرس؟"))return;
    const lesson=lessons.find(x=>x.id===id);if(!lesson)return;
    const {error}=await supabase.from("lessons").delete().eq("id",id);
    if(error){toast("تعذر حذف الدرس.");return;}
    await supabase.storage.from("lesson-videos").remove([lesson.storage_path]);
    toast("تم حذف الدرس.");await loadLessons();
  }
})();