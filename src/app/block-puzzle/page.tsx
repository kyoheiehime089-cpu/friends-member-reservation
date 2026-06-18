"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

const boardSize = 10;
const blockShapes = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1, 1]],
  [[1], [1], [1]],
  [[1, 1], [1, 1]],
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 0], [1, 0], [1, 1]],
  [[0, 1], [0, 1], [1, 1]],
  [[1, 1, 1], [0, 1, 0]],
  [[1, 0], [1, 1]],
  [[0, 1], [1, 1]],
] as const;

type Shape = number[][];
type Candidate = {
  id: string;
  shape: Shape;
};

type Board = boolean[][];

function createEmptyBoard(): Board {
  return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => false));
}

function randomCandidate(index: number): Candidate {
  const shape = blockShapes[Math.floor(Math.random() * blockShapes.length)].map((row) => [...row]);
  return { id: `${Date.now()}-${index}-${Math.random()}`, shape };
}

function createCandidates(): Candidate[] {
  return Array.from({ length: 3 }, (_, index) => randomCandidate(index));
}

function canPlaceBlock(board: Board, shape: Shape, row: number, col: number) {
  return shape.every((shapeRow, rowOffset) =>
    shapeRow.every((cell, colOffset) => {
      if (!cell) return true;
      const boardRow = row + rowOffset;
      const boardCol = col + colOffset;
      return boardRow >= 0 && boardRow < boardSize && boardCol >= 0 && boardCol < boardSize && !board[boardRow][boardCol];
    }),
  );
}

function placeAndClear(board: Board, shape: Shape, row: number, col: number) {
  const nextBoard = board.map((boardRow) => [...boardRow]);
  let placedCells = 0;

  shape.forEach((shapeRow, rowOffset) => {
    shapeRow.forEach((cell, colOffset) => {
      if (!cell) return;
      nextBoard[row + rowOffset][col + colOffset] = true;
      placedCells += 1;
    });
  });

  const fullRows = nextBoard.map((boardRow, index) => (boardRow.every(Boolean) ? index : -1)).filter((index) => index >= 0);
  const fullCols = Array.from({ length: boardSize }, (_, colIndex) =>
    nextBoard.every((boardRow) => boardRow[colIndex]) ? colIndex : -1,
  ).filter((index) => index >= 0);

  fullRows.forEach((rowIndex) => {
    for (let colIndex = 0; colIndex < boardSize; colIndex += 1) {
      nextBoard[rowIndex][colIndex] = false;
    }
  });

  fullCols.forEach((colIndex) => {
    for (let rowIndex = 0; rowIndex < boardSize; rowIndex += 1) {
      nextBoard[rowIndex][colIndex] = false;
    }
  });

  return {
    board: nextBoard,
    gainedScore: placedCells + (fullRows.length + fullCols.length) * boardSize,
    clearedLines: fullRows.length + fullCols.length,
  };
}

function hasAnyMove(board: Board, candidates: Candidate[]) {
  return candidates.some((candidate) =>
    Array.from({ length: boardSize }).some((_, row) =>
      Array.from({ length: boardSize }).some((__, col) => canPlaceBlock(board, candidate.shape, row, col)),
    ),
  );
}

export default function BlockPuzzlePage() {
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [candidates, setCandidates] = useState<Candidate[]>(() => createCandidates());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState('ブロックを選んで、盤面をタップしてください。');

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  const resetGame = () => {
    setBoard(createEmptyBoard());
    setCandidates(createCandidates());
    setSelectedId(null);
    setScore(0);
    setMessage('新しいゲームを始めました。ブロックを選んでください。');
  };

  const handleCellClick = (row: number, col: number) => {
    if (!selectedCandidate) {
      setMessage('先に下のブロック候補を選んでください。');
      return;
    }

    if (!canPlaceBlock(board, selectedCandidate.shape, row, col)) {
      setMessage('その場所には置けません。別のマスを選んでください。');
      return;
    }

    const result = placeAndClear(board, selectedCandidate.shape, row, col);
    const nextCandidates = candidates.filter((candidate) => candidate.id !== selectedCandidate.id);
    const replenishedCandidates = nextCandidates.length === 0 ? createCandidates() : nextCandidates;

    setBoard(result.board);
    setCandidates(replenishedCandidates);
    setSelectedId(null);
    setScore((currentScore) => currentScore + result.gainedScore);

    if (result.clearedLines > 0) {
      setMessage(`${result.clearedLines}ライン消えました！続けてブロックを置きましょう。`);
    } else if (!hasAnyMove(result.board, replenishedCandidates)) {
      setMessage('置ける場所がなくなりました。リセットしてもう一度挑戦してください。');
    } else {
      setMessage('ナイス配置です。次のブロックを選んでください。');
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="rounded-3xl bg-yellow-400 p-6 shadow-lg">
          <p className="text-sm font-bold uppercase tracking-wide text-yellow-900">Mini game</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black text-gray-950 sm:text-4xl">ブロックパズル</h1>
              <p className="mt-2 font-medium text-gray-800">10×10の盤面にブロックを置いて、縦横のラインを消しましょう。</p>
            </div>
            <div className="rounded-2xl bg-white px-5 py-3 text-center shadow-sm">
              <p className="text-xs font-bold text-gray-500">SCORE</p>
              <p className="text-3xl font-black text-gray-950">{score}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <section className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
            <div className="grid grid-cols-10 gap-1 touch-manipulation" aria-label="ブロックパズル盤面">
              {board.map((boardRow, rowIndex) =>
                boardRow.map((filled, colIndex) => {
                  const canPreview = selectedCandidate ? canPlaceBlock(board, selectedCandidate.shape, rowIndex, colIndex) : false;
                  return (
                    <button
                      key={`${rowIndex}-${colIndex}`}
                      type="button"
                      aria-label={`${rowIndex + 1}行 ${colIndex + 1}列`}
                      onClick={() => handleCellClick(rowIndex, colIndex)}
                      className={`aspect-square rounded-md border text-[0px] transition sm:rounded-lg ${
                        filled
                          ? 'border-yellow-500 bg-yellow-400 shadow-inner'
                          : canPreview
                            ? 'border-emerald-200 bg-emerald-50 active:bg-emerald-100'
                            : 'border-gray-200 bg-gray-50 active:bg-gray-100'
                      }`}
                    >
                      {filled ? '配置済み' : '空き'}
                    </button>
                  );
                }),
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">ブロック候補</h2>
              <p className="mt-2 text-sm font-medium text-gray-600">候補をタップしてから盤面をタップします。</p>
              <div className="mt-4 grid grid-cols-3 gap-3 lg:grid-cols-1">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedId(candidate.id)}
                    className={`rounded-2xl border-2 p-3 transition active:scale-95 ${
                      selectedId === candidate.id ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <span className="sr-only">ブロックを選択</span>
                    <span className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${candidate.shape[0].length}, minmax(0, 1fr))` }}>
                      {candidate.shape.flatMap((shapeRow, rowIndex) =>
                        shapeRow.map((cell, colIndex) => (
                          <span
                            key={`${rowIndex}-${colIndex}`}
                            className={`h-5 w-5 rounded sm:h-6 sm:w-6 ${cell ? 'bg-yellow-400' : 'bg-transparent'}`}
                          />
                        )),
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-700" aria-live="polite">{message}</p>
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={resetGame} className="rounded-full bg-gray-950 px-5 py-3 font-bold text-white active:scale-95">
                  リセット
                </button>
                <Link href="/" className="rounded-full bg-gray-100 px-5 py-3 text-center font-bold text-gray-900">
                  トップへ戻る
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
