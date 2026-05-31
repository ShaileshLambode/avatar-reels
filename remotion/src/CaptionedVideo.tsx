import React from "react";
import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { AnimatedCaption } from "./components/AnimatedCaption";
import { CaptionProps } from "./types";

export const CaptionedVideo: React.FC<CaptionProps> = ({
  videoSrc,
  captions,
  fontSize = 72,
  highlightColor = "#FFE600"
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Dynamically resolve static files vs remote URLs
  const resolvedSrc = videoSrc.startsWith("http") ? videoSrc : staticFile(videoSrc);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Background layer: The scaled/composed portrait MP4 video */}
      <Video 
        src={resolvedSrc} 
        style={{ 
          width: "100%", 
          height: "100%", 
          objectFit: "cover" 
        }} 
      />

      {/* Foreground overlay: Hormozi caption layer centered vertically near lower third */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: "300px",
          pointerEvents: "none"
        }}
      >
        <AnimatedCaption
          captions={captions}
          currentFrame={frame}
          fps={fps}
          fontSize={fontSize}
          highlightColor={highlightColor}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
