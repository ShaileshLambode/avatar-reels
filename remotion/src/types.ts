export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionProps {
  videoSrc: string;
  captions: Word[];
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  fontSize?: number;
  highlightColor?: string;
}
