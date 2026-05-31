import React from "react";
import { spring, useVideoConfig } from "remotion";
import { Word } from "../types";

interface AnimatedCaptionProps {
  captions: Word[];
  currentFrame: number;
  fps: number;
  fontSize?: number;
  highlightColor?: string;
}

export const AnimatedCaption: React.FC<AnimatedCaptionProps> = ({
  captions,
  currentFrame,
  fps,
  fontSize = 72,
  highlightColor = "#FFE600"
}) => {
  const { width } = useVideoConfig();
  const timeMs = (currentFrame / fps) * 1000;

  if (!captions || captions.length === 0) {
    return null;
  }

  // 1. Group words into pages of 3 words (standard Hormozi style)
  const wordsPerPage = 3;
  const pages: Array<{ words: Word[]; startMs: number; endMs: number }> = [];
  
  for (let i = 0; i < captions.length; i += wordsPerPage) {
    const pageWords = captions.slice(i, i + wordsPerPage);
    const startMs = pageWords[0].startMs;
    const endMs = pageWords[pageWords.length - 1].endMs;
    pages.push({
      words: pageWords,
      startMs,
      endMs
    });
  }

  // 2. Find the active page based on the current time
  let activePageIndex = pages.findIndex(
    (p) => timeMs >= p.startMs && timeMs <= p.endMs
  );

  // Fallback to closest page if between pages or finished
  if (activePageIndex === -1) {
    if (timeMs < pages[0].startMs) {
      activePageIndex = 0;
    } else {
      activePageIndex = pages.length - 1;
    }
  }

  const activePage = pages[activePageIndex];

  // 3. Style constants
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: width * 0.9,
    margin: "0 auto",
    gap: "20px"
  };

  const wordBaseStyle: React.CSSProperties = {
    fontFamily: "'Arial Black', Montserrat, Impact, sans-serif",
    fontSize: `${fontSize}px`,
    fontWeight: 900,
    textTransform: "uppercase",
    textAlign: "center",
    letterSpacing: "1px",
    display: "inline-block",
    // Premium, solid black outline around text
    textShadow: `
      -3px -3px 0 #000,  
       3px -3px 0 #000,
      -3px  3px 0 #000,
       3px  3px 0 #000,
      -4px  0px 0 #000,
       4px  0px 0 #000,
       0px -4px 0 #000,
       0px  4px 0 #000,
       0px 0px 8px rgba(0,0,0,0.8)
    `,
    transition: "color 0.1s ease"
  };

  return (
    <div style={containerStyle}>
      {activePage.words.map((word, idx) => {
        const isActive = timeMs >= word.startMs && timeMs <= word.endMs;
        
        // Calculate frame offset when word started for spring animation
        const wordStartFrame = (word.startMs / 1000) * fps;
        const frameSinceStart = Math.max(0, currentFrame - wordStartFrame);
        
        const popSpring = spring({
          frame: frameSinceStart,
          fps,
          config: {
            damping: 10,
            stiffness: 180,
            mass: 0.5
          }
        });

        // Current word scales up to 1.15x, other words stay at 1.0x
        const scale = isActive ? 1.0 + popSpring * 0.15 : 1.0;
        // Current word slightly tilts for a highly dynamic effect
        const rotate = isActive ? -3 : 0;

        const style: React.CSSProperties = {
          ...wordBaseStyle,
          color: isActive ? highlightColor : "#FFFFFF",
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          transformOrigin: "center center"
        };

        return (
          <span key={`${word.text}-${idx}`} style={style}>
            {word.text}
          </span>
        );
      })}
    </div>
  );
};
