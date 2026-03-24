"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRoomCode = generateRoomCode;
exports.calculateScore = calculateScore;
__exportStar(require("./types"), exports);
// Utility functions
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous characters
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
function calculateScore(isCorrect, timeTakenMs, roundDurationMs = 30000) {
    if (!isCorrect)
        return 0;
    const basePoints = 100;
    const timeFraction = Math.max(0, (roundDurationMs - timeTakenMs) / roundDurationMs);
    const multiplier = 1 + timeFraction; // 1x to 2x based on speed
    return Math.round(basePoints * multiplier);
}
