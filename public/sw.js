self.addEventListener('push',event=>{
  if(!event.data)return;
  const data=event.data.json();
  event.waitUntil(self.registration.showNotification(data.title||'Duet 行程提醒',{
    body:data.body||'你們有一個即將開始的行程。',
    icon:'/icons/icon-192.png',
    badge:'/icons/favicon-32.png',
    tag:data.tag||'duet-reminder',
    data:{url:data.url||'/?open=calendar'},
    vibrate:[120,60,120]
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const existing=list.find(client=>client.url.startsWith(self.location.origin));
    if(existing){existing.navigate(target);return existing.focus();}
    return clients.openWindow(target);
  }));
});
