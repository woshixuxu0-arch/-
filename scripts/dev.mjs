import './build.mjs';
import {Miniflare} from 'miniflare';
const mf=new Miniflare({scriptPath:'dist/server/index.js',modules:true,compatibilityDate:'2026-01-01',port:Number(process.env.PORT)||3000,
  assets:{directory:'dist/client',binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
  durableObjects:{QUOTA_LEDGER:{className:'QuotaLedger',useSQLite:true}},durableObjectsPersist:'.wrangler/local-quota',
  bindings:{DIFY_API_URL:process.env.DIFY_API_URL || 'https://api.dify.ai/v1',DIFY_API_KEY:process.env.DIFY_API_KEY || '',VISITOR_DAILY_LIMIT:'3',GLOBAL_DAILY_LIMIT:'30'}
});
console.log('JobFit local preview:',String(await mf.ready));
process.on('SIGINT',async()=>{await mf.dispose();process.exit();});
