import Image from "next/image";

type ResponsiveImageProps = {
  alt?: string;
  className?: string;
  sizes?: string;
  src: string;
};

const passthroughLoader = ({ src }: { src: string }) => src;

export function ResponsiveImage({ alt = "", className = "responsive-image", sizes = "(max-width: 768px) 100vw, 420px", src }: ResponsiveImageProps) {
  return <Image alt={alt} className={className} fill loader={passthroughLoader} sizes={sizes} src={src} unoptimized />;
}
