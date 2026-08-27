export class AdaptiveRouter {
  constructor({registry, role, lang}){ this.registry=registry; this.role=role; this.lang=lang }
  pick(){ const list=this.registry.list(); return list[0]?.id || null }
}
