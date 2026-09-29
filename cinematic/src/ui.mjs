// Фокус, клавиатура и делегирование кликов — отдельно от симуляции.
const SHEETS=['choiceBox','ideaBox','menuBox'];

export class SheetController {
  constructor(doc=document) {
    this.doc=doc;
    this.active=null;
    this.opener=null;
    this.backdrop=doc.getElementById('modalBackdrop');
    this.background=[
      doc.querySelector('.hud'),doc.querySelector('.action-dock'),
      doc.getElementById('dialog'),
    ];
    this.backdrop.addEventListener('click',()=>this.close());
    doc.addEventListener('keydown',event=>this.onKeydown(event));
  }

  open(id) {
    if (!SHEETS.includes(id)) return;
    if (!this.active) this.opener=this.doc.activeElement;
    this.close({restoreFocus:false,keepOpener:true});
    this.active=this.doc.getElementById(id);
    this.active.hidden=false;
    this.backdrop.hidden=false;
    for (const element of this.background) if (element) element.inert=true;
    const target=id==='ideaBox'
      ? this.doc.getElementById('ideaText')
      : this.active.querySelector('[data-decision],button,a[href],textarea');
    target?.focus();
  }

  close({restoreFocus=true,keepOpener=false}={}) {
    for (const id of SHEETS) this.doc.getElementById(id).hidden=true;
    this.backdrop.hidden=true;
    for (const element of this.background) if (element) element.inert=false;
    this.active=null;
    if (restoreFocus && this.opener?.isConnected) this.opener.focus();
    if (!keepOpener) this.opener=null;
  }

  onKeydown(event) {
    if (!this.active) return;
    if (event.key==='Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key!=='Tab') return;
    const focusable=[...this.active.querySelectorAll(
      'button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled)',
    )].filter(el=>!el.hidden && el.getClientRects().length);
    if (!focusable.length) return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if (event.shiftKey && (this.doc.activeElement===first ||
      !this.active.contains(this.doc.activeElement))) {
      event.preventDefault();last.focus();
    } else if (!event.shiftKey && (this.doc.activeElement===last ||
      !this.active.contains(this.doc.activeElement))) {
      event.preventDefault();first.focus();
    }
  }
}

export function delegateGameEvents(doc,{build,decide,openIdea}) {
  const dock=doc.querySelector('.action-dock');
  const decisions=doc.querySelector('.decisions');
  dock.addEventListener('click',event=>{
    const button=event.target.closest('.option');
    if (!button || !dock.contains(button)) return;
    const kind=button.dataset.action;
    if (kind==='idea') openIdea();
    else build(kind);
  });
  decisions.addEventListener('click',event=>{
    const button=event.target.closest('[data-decision]');
    if (!button || !decisions.contains(button)) return;
    const id=Number(button.dataset.decision);
    if (Number.isInteger(id)) decide(id);
  });
}
