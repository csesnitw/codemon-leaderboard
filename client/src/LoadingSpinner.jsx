import React from 'react';

const PIKACHU_RUNNING_GIF_URI = 'https://media.tenor.com/fSsxftCb8w0AAAAj/pikachu-running.gif';

export default function LoadingSpinner() {
  return (
    <div className="loading-container">
      <div className="flex flex-col items-center gap-4">
        <div
          className="pikachu-spinner"
          style={{ backgroundImage: `url(${PIKACHU_RUNNING_GIF_URI})` }}
        />
        <p className="text-amber-400 font-pokemon text-2xl tracking-wider">Loading...</p>
      </div>
    </div>
  );
}