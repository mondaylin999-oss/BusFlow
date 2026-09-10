#include <iostream>
#include <string>
#include <stdexcept>
#include <limits>
// Integer-only commission/refund engine. PostgreSQL owns allocation and locks.
int main(int argc,char** argv) {
 try {
  if(argc!=3) throw std::invalid_argument("usage: bus_rules amount percent");
  size_t a=0,b=0; long long amount=std::stoll(argv[1],&a), percent=std::stoll(argv[2],&b);
  if(a!=std::string(argv[1]).size()||b!=std::string(argv[2]).size()||amount<0||percent<0||percent>100||amount>9007199254740991LL)throw std::invalid_argument("invalid input");
  std::cout << (amount/100)*percent+(amount%100)*percent/100 << '\n';return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
