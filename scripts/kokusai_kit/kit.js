(function(){
var D=JSON.parse(document.getElementById("kdata").textContent),N=D.n;
function post(m){try{parent.postMessage(m,"*")}catch(e){}}
function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e}
var LS={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
var root=document.getElementById("app"),secNo=0,LET=["ア","イ","ウ","エ"];
root.appendChild(el("div","top","国際関係｜第"+N+"回｜"+D.date));
root.appendChild(el("h1",null,D.theme+(D.minutes?'<span class="min">約'+D.minutes+'分</span>':"")));
if(D.subtitle)root.appendChild(el("p","sub",D.subtitle));
function section(p){var s=el("section");if(p.title){secNo++;s.appendChild(el("h2",null,"<i>"+secNo+"</i>"+p.title))}if(p.cap)s.appendChild(el("p","cap",p.cap));root.appendChild(s);return s}
var R={};
R.goals=function(p){var s=section(p),prog=el("div","prog"),gg=el("div","g2");s.appendChild(prog);s.appendChild(gg);var key="kok_goal_"+N,st={};try{st=JSON.parse(LS.get(key)||"{}")}catch(e){}
  function upd(){var n=0;p.items.forEach(function(_,i){if(st[i]==="ok")n++});prog.textContent="言えた "+n+" / "+p.items.length}
  p.items.forEach(function(g,i){var d=el("div","goal");var q=el("button","gq",'<span class="gn">'+(i+1)+'</span><span class="gt">'+g.q+'</span><span class="gs"></span>');
    var a=el("div","ga","<ul>"+g.a.map(function(x){return"<li>"+x+"</li>"}).join("")+'</ul><div class="jb"><button data-v="ok">言えた</button><button data-v="ng">あやしい</button></div>');
    d.appendChild(q);d.appendChild(a);gg.appendChild(d);
    function paint(){var v=st[i];d.classList.toggle("ok",v==="ok");d.classList.toggle("ng",v==="ng");q.querySelector(".gs").textContent=v==="ok"?"言えた":v==="ng"?"あやしい":"答えを見る";upd()}
    q.onclick=function(){d.classList.toggle("open")};
    a.querySelectorAll("button").forEach(function(b){b.onclick=function(){st[i]=b.dataset.v;LS.set(key,JSON.stringify(st));paint()}});paint()});upd()};
R.map=function(p){var s=section(p),L=p.lanes,nodes=p.nodes,map=el("div","map");
  map.style.gridTemplateColumns="44px repeat("+L.length+",minmax(0,1fr))";if(L.length>4)map.style.fontSize="11px";
  var from={},btns={};nodes.forEach(function(n){(n.to||[]).forEach(function(t){(from[t]=from[t]||[]).push(n.id)})});
  var byId={};nodes.forEach(function(n){byId[n.id]=n});
  map.appendChild(el("div"));L.forEach(function(l,i){map.appendChild(el("div","lh c"+(i%6),l))});
  p.rows.forEach(function(r,ri){map.appendChild(el("div","yr",r));L.forEach(function(l,li){var n=null;nodes.forEach(function(x){if(x.r===ri&&x.l===li)n=x});
    if(!n){map.appendChild(el("div"));return}var b=el("button","nd c"+(li%6),"<b>"+n.t+"</b>");btns[n.id]=b;map.appendChild(b);b.onclick=function(){sel(n.id)}})});
  var mw=el("div","mw"),ml=el("div");ml.appendChild(map);ml.appendChild(el("div","leg",'<span class="l3">選んだもの</span><span class="l1">原因</span><span class="l2">結果</span>'));mw.appendChild(ml);
  var card=el("div","card",'<span class="hint">できごとをタップすると、ここに「何が・原因と結果・ひっかけ」が出ます。</span>');mw.appendChild(card);s.appendChild(mw);
  function chip(id){var b=el("button","",byId[id].t);b.onclick=function(){sel(id,true)};return b}
  function sel(id,sc){var n=byId[id];Object.keys(btns).forEach(function(x){var c=btns[x].classList;c.remove("sel","cause","eff","dim");if(x===id)c.add("sel");else if((n.to||[]).indexOf(x)>=0)c.add("eff");else if((from[id]||[]).indexOf(x)>=0)c.add("cause");else c.add("dim")});
    card.innerHTML="";card.appendChild(el("div","ct",n.t));if(n.y)card.appendChild(el("div","cy",n.y));
    card.appendChild(el("h4",null,"何が起きた？"));card.appendChild(el("ul",null,(n.w||[]).map(function(x){return"<li>"+x+"</li>"}).join("")));
    var c=(from[id]||[]).filter(function(x){return byId[x]});if(c.length){card.appendChild(el("h4",null,"原因（これの前）"));var d=el("div","rel");c.forEach(function(x){d.appendChild(chip(x))});card.appendChild(d)}
    var t=(n.to||[]).filter(function(x){return byId[x]});if(t.length){card.appendChild(el("h4",null,"結果（これの後）"));var d2=el("div","rel");t.forEach(function(x){d2.appendChild(chip(x))});card.appendChild(d2)}
    if(n.trap)card.appendChild(el("div","trap","<b>ひっかけ：</b>"+n.trap));
    if(n.refs&&n.refs.length){card.appendChild(el("h4",null,"前の回とのつながり"));var rr=el("div","rel");n.refs.forEach(function(r){var m=(D.cum||[]).filter(function(x){return x.id===r})[0];if(!m)return;var b=el("button","","第"+m.n+"回　"+m.t);b.onclick=function(){post({type:"openBrief",n:m.n,from:N})};rr.appendChild(b)});card.appendChild(rr)}
    wrap(card);if(sc&&window.innerWidth<760)card.scrollIntoView({behavior:"smooth",block:"nearest"})}};
R.traps=function(p){var s=section(p),g=el("div","g2");s.appendChild(g);p.items.forEach(function(t){var d=el("div","fl");var b=el("button","",'<span class="bad">'+t.bad+'</span><span class="tap">タップで正しい形を見る</span>');d.appendChild(b);d.appendChild(el("div","good","<b>正しくは：</b>"+t.good));b.onclick=function(){d.classList.toggle("open")};g.appendChild(d)})};
R.compare=function(p){var s=section(p);var t="<table class=\"cmp\"><tr>"+p.head.map(function(h){return"<th>"+h+"</th>"}).join("")+"</tr>"+p.rows.map(function(r){return"<tr>"+r.map(function(c){return"<td>"+c+"</td>"}).join("")+"</tr>"}).join("")+"</table>";s.appendChild(el("div",null,t));if(p.points){var g=el("div","g2");p.points.forEach(function(x){g.appendChild(el("div","kc",x))});s.appendChild(g)}};
R.numbers=function(p){var s=section(p);s.appendChild(el("div","nums",p.items.map(function(x){return'<div class="num"><b>'+x.big+'</b><span>'+x.label+'</span></div>'}).join("")))};
R.bullets=function(p){var s=section(p),g=el("div","g2");s.appendChild(g);p.items.forEach(function(x){g.appendChild(el("div","kc",x))})};
R.pair=function(p){var s=section(p),g=el("div","pair");[["l",p.left],["r",p.right]].forEach(function(x){var d=el("div","pc "+x[0],"<h3>"+x[1].h+"</h3><ul>"+x[1].items.map(function(i){return"<li>"+i+"</li>"}).join("")+"</ul>");g.appendChild(d)});s.appendChild(g)};
R.links=function(p){var s=section(p);var d=el("div","chipr");p.items.forEach(function(x){var b=el("span",null,(x.n?"第"+x.n+"回　":"")+x.label);if(x.n)b.onclick=function(){post({type:"openBrief",n:x.n,from:N})};d.appendChild(b)});s.appendChild(d)};
R.html=function(p){var s=section(p);s.appendChild(el("div",null,p.html))};

/* これで完成の問題: 問題文はこの端末の localStorage(kanzen_bank_v1)にだけある。ここ(公開ファイル)には問題番号しか書かない。 */
R.kanzen=function(p){var s=section(p),box=el("div","kzbox"),bank=null,res={};s.appendChild(box);
  try{var o=JSON.parse(LS.get("kanzen_bank_v1")||"null");if(o&&o.problems)bank=o.problems}catch(e){}
  try{res=JSON.parse(LS.get("kanzen_res_v1")||"{}")||{}}catch(e){}
  var nums=p.items||[];
  if(!bank){box.appendChild(el("p","cap","問題がこの端末に入っていません。国際タブの「これで完成」カードで問題ファイルを取り込むと、ここで解けます。"));
    box.appendChild(el("div","kc","解く問題：これで完成 <b>問題"+nums.join("・")+"</b>"));return}
  var by={};bank.forEach(function(q){by[q.no]=q});
  var KL=["１","２","３","４","５"];
  nums.forEach(function(no,i){var q=by[no];if(!q){box.appendChild(el("p","cap","問題"+no+"が見つかりません。"));return}
    var w=el("div","kzw");w.appendChild(el("div","qk","これで完成　問題"+no+(q.topic?"　"+q.topic:"")));
    w.appendChild(el("div","qt","問"+(i+1)+"　"+String(q.stem).replace(/\n/g,"<br>")));
    var vd=el("div","vd");vd.style.display="none";
    function paint(picked,silent){[].forEach.call(w.querySelectorAll("button.opt"),function(b){var k=+b.dataset.k;b.classList.remove("ok","ng");if(k===q.ans)b.classList.add("ok");else if(k===picked)b.classList.add("ng")});
      var ok=picked===q.ans;vd.style.display="block";vd.innerHTML=(ok?'<b class="o">正解</b>':'<b class="x">不正解</b>（あなた：'+KL[picked-1]+'　正解：'+KL[q.ans-1]+'）');
      if(q.exp){var det=el("details",null,"<summary>解説を見る</summary>"+String(q.exp).replace(/\n/g,"<br>"));vd.appendChild(det)}
      var r=el("button","retry","もう一度");r.type="button";r.onclick=function(){[].forEach.call(w.querySelectorAll("button.opt"),function(b){b.classList.remove("ok","ng")});vd.style.display="none";vd.innerHTML=""};vd.appendChild(r);
      if(!silent){res[no]={picked:picked,ok:ok,at:new Date().toISOString()};LS.set("kanzen_res_v1",JSON.stringify(res));post({type:"kanzen",issue:N,no:no,picked:picked,ok:ok})}}
    q.options.forEach(function(t,j){var b=el("button","opt",KL[j]+"　"+String(t).replace(/\n/g,"<br>"));b.dataset.k=j+1;b.onclick=function(){paint(j+1,false)};w.appendChild(b)});
    w.appendChild(vd);box.appendChild(w);
    if(res[no]&&res[no].picked)paint(res[no].picked,true)})};
var QS=[];
function quiz(p,retry){var s=section(p),g=el("div","g2");s.appendChild(g);p.items.forEach(function(q,i){var box=el("div","qw");box.dataset.qid=q.qid;box.dataset.ans=LET[q.a];
  if(q.kind||retry)box.appendChild(el("div","qk",retry?("第"+q.issue+"回の問題（前に間違えた）"):q.kind));
  box.appendChild(el("div","qt",(q.label||("問"+(i+1)))+"　"+q.q));q.o.forEach(function(t,j){var b=el("button","opt",LET[j]+"　"+t);b.dataset.k=LET[j];box.appendChild(b)});
  box.dataset.e=q.e||"";g.appendChild(box);QS.push(box)})}
R.quiz=function(p){quiz(p,false)};R.retry=function(p){if(p.items&&p.items.length)quiz(p,true)};
function mark(c,picked,silent){var ans=c.dataset.ans;c.classList.add("done");[].forEach.call(c.querySelectorAll("button.opt"),function(b){b.classList.remove("ok","ng");if(b.dataset.k===ans)b.classList.add("ok");else if(b.dataset.k===picked)b.classList.add("ng")});
  var old=c.querySelector(".vd");if(old)old.remove();var ok=picked===ans,v=el("div","vd",(ok?'<b class="o">正解</b>':'<b class="x">不正解</b>（あなた：'+picked+'　正解：'+ans+'）')+"<div class=\"ex\">"+String(c.dataset.e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\n/g,"<br>")+"</div>");
  var r=el("button","retry","もう一度");r.type="button";v.appendChild(r);c.appendChild(v);if(!silent)post({type:"quiz",issue:N,qid:c.dataset.qid,picked:picked,ans:ans,ok:ok})}
R.cumulative=function(p){var s=section(p),cum=D.cum||[],mine=cum.filter(function(x){return x.n===N}),g=el("div","pair"),L=el("div","pc l"),Rr=el("div","pc r");
  var rows=[];mine.forEach(function(m){(m.refs||[]).forEach(function(r){var o=cum.filter(function(x){return x.id===r})[0];if(o)rows.push([o,m])})});
  L.appendChild(el("h3",null,"前の回とのつながり"));
  if(rows.length)rows.forEach(function(r){var d=el("div","xrow");var a=el("span","x","第"+r[0].n+"回　"+r[0].t);a.onclick=function(){post({type:"openBrief",n:r[0].n,from:N})};d.appendChild(a);d.appendChild(el("span",null,"→"));d.appendChild(el("span","y","今回："+r[1].t));L.appendChild(d)});
  else L.appendChild(el("p","cap","この回は、まだ前の回とのつながりがありません。"));
  Rr.appendChild(el("h3",null,"これまでの年表（"+cum.length+"件）"));var tl=el("div","tl");
  cum.slice().sort(function(a,b){return(a.ys||0)-(b.ys||0)}).forEach(function(x){var it=el("div","it"+(x.n===N?" me":""),'<span class="y">'+(x.y||"")+"</span> "+x.t);var tg=el("span","tg","第"+x.n+"回");if(x.n!==N)tg.onclick=function(){post({type:"openBrief",n:x.n,from:N})};it.appendChild(tg);tl.appendChild(it)});
  Rr.appendChild(tl);g.appendChild(L);g.appendChild(Rr);s.appendChild(g)};
(D.parts||[]).forEach(function(p){(R[p.type]||function(){})(p)});
document.addEventListener("click",function(e){var t=e.target;
  var rt=t.closest&&t.closest(".retry");if(rt){var c0=rt.closest(".qw");c0.classList.remove("done");[].forEach.call(c0.querySelectorAll("button.opt"),function(b){b.classList.remove("ok","ng")});var vd=c0.querySelector(".vd");if(vd)vd.remove();return}
  var b=t.closest&&t.closest("button.opt");if(!b)return;var c=b.closest(".qw");if(!c||c.classList.contains("done"))return;mark(c,b.dataset.k,false)});
window.addEventListener("message",function(e){var m=e.data;if(!m||m.type!=="state"||!m.results)return;QS.forEach(function(c){var r=m.results[c.dataset.qid];if(r&&r.picked)mark(c,r.picked,true)})});
/* 用語タップ */
var GL=D.glossary||{},keys=Object.keys(GL).sort(function(a,b){return b.length-a.length}),re=keys.length?new RegExp(keys.map(function(k){return k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}).join("|"),"g"):null;
function skip(n){for(var e=n.parentNode;e&&e!==document.body;e=e.parentNode){var t=e.tagName;if(t==="BUTTON"||t==="SCRIPT"||t==="H1"||t==="H2"||t==="H4"||t==="SUMMARY"||(e.classList&&(e.classList.contains("w")||e.classList.contains("qw"))))return true}return false}
function wrap(rootEl){if(!re)return;var seen={},w=document.createTreeWalker(rootEl,NodeFilter.SHOW_TEXT),list=[],n;while(n=w.nextNode())list.push(n);
  list.forEach(function(tn){if(skip(tn))return;var txt=tn.nodeValue;re.lastIndex=0;if(!re.test(txt))return;re.lastIndex=0;var frag=document.createDocumentFragment(),last=0,m;
    while((m=re.exec(txt))){if(seen[m[0]])continue;seen[m[0]]=1;frag.appendChild(document.createTextNode(txt.slice(last,m.index)));var sp=el("span","w",m[0]);sp.dataset.t=m[0];frag.appendChild(sp);last=m.index+m[0].length}
    if(!last)return;frag.appendChild(document.createTextNode(txt.slice(last)));tn.parentNode.replaceChild(frag,tn)})}
[].forEach.call(root.children,function(c){if(c.tagName==="SECTION")wrap(c)});
var bub=el("div");bub.id="bub";document.body.appendChild(bub);var cur=null;function hide(){bub.style.display="none";cur=null}
document.addEventListener("click",function(e){var t=e.target.closest&&e.target.closest(".w");if(!t){if(!e.target.closest("#bub"))hide();return}if(cur===t){hide();return}cur=t;
  bub.innerHTML="";bub.appendChild(el("b",null,t.dataset.t));bub.appendChild(el("span",null,GL[t.dataset.t]||""));bub.style.display="block";
  var r=t.getBoundingClientRect(),bw=bub.offsetWidth,bh=bub.offsetHeight,x=Math.max(12,Math.min(r.left,window.innerWidth-bw-12)),y=r.top-bh-10;if(y<8)y=r.bottom+10;bub.style.left=x+"px";bub.style.top=y+"px"});
window.addEventListener("scroll",hide,{passive:true});
post({type:"ready",issue:N});
})();
