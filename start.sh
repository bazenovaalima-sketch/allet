#!/bin/bash

# Убиваем предыдущие процессы если они есть
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo "Запуск бэкенда..."
source backend/venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Запуск фронтенда..."
cd frontend
npm run dev -- --host &
FRONTEND_PID=$!

echo "-----------------------------------"
echo "Приложение запущено!"
echo "Бэкенд: http://localhost:8000"
echo "Фронтенд: http://localhost:5173"
echo "Нажмите Ctrl+C для остановки."
echo "-----------------------------------"

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
