import type {UserTradingRow} from './trading-rows';
export interface AppUser extends UserTradingRow {username:string;password_hash:string;role:string;language:'en'|'az';telegram_chat_id:string|null;telegram_username:string|null;last_force_run:number;last_futures_force_run:number;last_reminder_sent_date:string|null;warning_7d_sent:number;warning_3d_sent:number;created_at:string;has_binance_keys?:boolean;monthly_profit?:number;lifetime_profit?:number}
export interface Payment {id:number;user_id:number;username:string;status:string;amount:number;txid:string;created_at:string}
export interface Ticket {id:number;user_id:number;username:string;phone:string;email:string;subject:string;message:string;status:string;admin_reply:string|null;created_at:string}
export interface Message {id:number;user_id:number;sender:string;text:string;created_at:string}
export interface Notification {id:number;title:string;message:string;is_read:number;created_at:string}
export interface Setting {key:string;value:string}
