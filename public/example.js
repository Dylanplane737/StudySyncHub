const urlInput=document.getElementById("urlInput");
const searchButton=document.getElementById("searchButton");
const clearButton=document.getElementById("clearButton");
const iframeWindow=document.getElementById("iframeWindow");
const content=document.querySelector(".nova-content");

function go(){
    let url=urlInput.value.trim();
    if(!url){urlInput.focus();return;}
    const searchUrl="https://www.google.com/search?q=";
    if(!url.includes(".")) url=searchUrl+encodeURIComponent(url);
    else if(!url.startsWith("http://")&&!url.startsWith("https://")) url="https://"+url;
    iframeWindow.src=__uv$config.prefix+__uv$config.encodeUrl(url);
    content.classList.add("has-page");
}
urlInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();go();}});
searchButton.addEventListener("click",e=>{e.preventDefault();go();});
clearButton.addEventListener("click",()=>{urlInput.value="";urlInput.focus();});
iframeWindow.addEventListener("load",()=>content.classList.add("has-page"));
searchButton.addEventListener("pointerdown",()=>{if(navigator.vibrate)navigator.vibrate(10);});
