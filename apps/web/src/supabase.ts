import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://nbvzabttnprbieyogxeu.supabase.co";
const supabaseAnonKey = "sb_publishable_xJjKezaN1HWlgyyXlWlAjw_SjxkY7CD";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
