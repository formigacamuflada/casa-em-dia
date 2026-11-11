// Esconde o console no Windows em builds de produção.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    casa_em_dia_lib::run()
}
