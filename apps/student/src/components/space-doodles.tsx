import Image from "next/image";

const doodles = {
  coding: { src: "/doodles/01_astronaut_coding_on_moon.png", width: 331, height: 270 },
  rocket: { src: "/doodles/02_astronaut_riding_rocket.png", width: 285, height: 267 },
  flag: { src: "/doodles/03_astronaut_holding_flag.png", width: 298, height: 287 },
  laptop: { src: "/doodles/08_astronaut_coding_laptop.png", width: 289, height: 225 },
  telescope: { src: "/doodles/10_astronaut_using_telescope.png", width: 288, height: 249 },
  idea: { src: "/doodles/11_astronaut_with_idea.png", width: 299, height: 252 },
  resources: { src: "/doodles/14_astronaut_with_resources.png", width: 321, height: 256 },
  megaphone: { src: "/doodles/15_astronaut_with_megaphone.png", width: 298, height: 259 },
  planet: { src: "/doodles/17_ringed_planet.png", width: 162, height: 145 },
} as const;

export type DoodleScene = keyof typeof doodles;

export function AstronautDoodle({ scene = "coding", className = "", priority = false }: { scene?: DoodleScene; className?: string; priority?: boolean }) {
  const doodle = doodles[scene];
  return <Image src={doodle.src} alt="" aria-hidden="true" width={doodle.width} height={doodle.height} priority={priority} className={className} />;
}
