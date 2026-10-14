export const PRAYERS=[['prime','باكر'],['third','الثالثة'],['sixth','السادسة'],['ninth','التاسعة'],['vespers','الغروب'],['compline','النوم'],['midnight','منتصف الليل']];
export const PRAYER_IDS=PRAYERS.map(p=>p[0]);
export const LITURGY_TYPES=['أحد','مناسبة','يوم عادي'];
export const esc=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
