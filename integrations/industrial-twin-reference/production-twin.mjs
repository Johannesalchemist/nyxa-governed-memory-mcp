export function joinProductionTwin(asset, business){
  if(!business || business.assetId!==asset.assetId) throw new Error('PRODUCTION_ASSET_MISMATCH');
  const required=['bom','workOrders','cost','capacity','margin'];
  for(const k of required) if(!(k in business)) throw new Error(`PRODUCTION_FIELD_MISSING:${k}`);
  return {assetId:asset.assetId, spatial:{observationCount:asset.observations.length,latest:asset.observations.at(-1)}, production:{bom:business.bom,workOrders:business.workOrders,capacity:business.capacity}, economics:{cost:business.cost,margin:business.margin}, provenance:business.provenance};
}
export function simulateMove(twin,{capacityDeltaPct=0,costDeltaPct=0}){
  return {assetId:twin.assetId,scenario:'MOVE_ASSET',baseline:{capacity:twin.production.capacity,cost:twin.economics.cost,margin:twin.economics.margin},projected:{capacity:twin.production.capacity*(1+capacityDeltaPct/100),cost:twin.economics.cost*(1+costDeltaPct/100),margin:twin.economics.margin-twin.economics.cost*(costDeltaPct/100)}};
}
